import { randomUUID } from "node:crypto";
import { callTool } from "../lib/mcp-client.js";
import { converse } from "../lib/llm/index.js";
import { logger } from "../lib/logger.js";
import { RESPONSE_SYSTEM_PROMPT } from "./prompts.js";
import { plan } from "./planner.js";
import { resolveContext, extractRecipient } from "./context.js";
import { requiresConfirmation } from "./safety.js";
import type {
  AgentAction,
  AgentInput,
  AgentOutput,
  AnalyzeMessageResult,
  ContextMatch,
  ConversationState,
  PendingConfirmation,
  Plan,
} from "../models/schemas.js";

// ─────────────────────────────────────────────────────────────
// Conversation state store (in-memory; TTL-evicted)
// ─────────────────────────────────────────────────────────────

const conversations = new Map<string, ConversationState>();
const STATE_TTL_MS = 30 * 60 * 1000;

function now(): string {
  return new Date().toISOString();
}

function getOrCreateState(
  userId: string,
  conversationId: string,
): ConversationState {
  const existing = conversations.get(conversationId);
  if (existing) return existing;

  const created: ConversationState = {
    conversationId,
    userId,
    recentTurns: [],
    activeContext: null,
    pendingConfirmation: null,
    pendingReminderMessage: null,
    createdAt: now(),
    updatedAt: now(),
  };
  conversations.set(conversationId, created);
  return created;
}

function recordTurn(
  state: ConversationState,
  role: "user" | "agent",
  text: string,
): void {
  state.recentTurns.push({ role, text, at: now() });
  if (state.recentTurns.length > 20) {
    state.recentTurns = state.recentTurns.slice(-20);
  }
  state.updatedAt = now();
}

setInterval(
  () => {
    const cutoff = Date.now() - STATE_TTL_MS;
    for (const [id, s] of conversations) {
      if (new Date(s.updatedAt).getTime() < cutoff) {
        conversations.delete(id);
        logger.debug("Evicted stale conversation", { conversationId: id });
      }
    }
  },
  5 * 60 * 1000,
).unref();

// ─────────────────────────────────────────────────────────────
// Demo message source
// ─────────────────────────────────────────────────────────────

/**
 * In production this reads from the user's inbox / SMS integration.
 * For the hackathon, the demo electricity-bill message is returned
 * whenever the user says they received a message they don't understand.
 */
function getCurrentMessage(): { content: string; source: string } {
  // Use a fixed future date well past the hackathon window so the
  // demo remains coherent regardless of recording date.
  const due = new Date();
  due.setUTCMonth(due.getUTCMonth() + 1, 15);
  const dueLabel = due.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return {
    content: `Electricity bill of ₹1,842.\nPayment due ${dueLabel}.`,
    source: "demo_fixture",
  };
}

// ─────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────

export async function handleMessage(input: AgentInput): Promise<AgentOutput> {
  const state = getOrCreateState(input.userId, input.conversationId);
  recordTurn(state, "user", input.message);

  const planResult = await plan(input.message, state);
  logger.info("Planned intent", {
    conversationId: input.conversationId,
    intent: planResult.intent,
    reasoning: planResult.reasoning,
  });

  let output: AgentOutput;

  switch (planResult.intent) {
    case "UNDERSTAND_MESSAGE":
      output = await handleUnderstand(state, input.message);
      break;
    case "FOLLOW_UP":
      output = await handleFollowUp(state, input.message);
      break;
    case "CREATE_REMINDER":
      output = await handleCreateReminder(state, input.message, planResult);
      break;
    case "DRAFT_MESSAGE":
      output = await handleDraftMessage(state, input.message, planResult);
      break;
    case "CONFIRM_SEND":
      output = await handleConfirmSend(state, input.message);
      break;
    case "DENY_SEND":
      output = handleDenySend(state);
      break;
    case "RETRIEVE_CONTEXT":
      output = await handleRetrieveContext(state, input.message, planResult);
      break;
    case "LIST_REMINDERS":
      output = await handleListReminders(state);
      break;
    default:
      output = await handleUnknown(state, input.message);
      break;
  }

  recordTurn(state, "agent", output.reply);
  return output;
}

// ─────────────────────────────────────────────────────────────
// Intent handlers
// ─────────────────────────────────────────────────────────────

async function handleUnderstand(
  state: ConversationState,
  userMessage: string,
): Promise<AgentOutput> {
  // Analyze the user's actual message first.
  const directAnalysis = await callTool<AnalyzeMessageResult>(
    "analyze_message",
    {
      content: userMessage,
      source: "user_message",
    },
  );

  let analyzed: AnalyzeMessageResult;
  let usedSource: string;

  if (directAnalysis.entities.length > 0) {
    analyzed = directAnalysis;
    usedSource = "user_message";
  } else {
    // The user referred to a message without pasting it.
    // Fall back to the demo fixture.
    const { content, source } = getCurrentMessage();
    analyzed = await callTool<AnalyzeMessageResult>("analyze_message", {
      content,
      source,
    });
    usedSource = source;
  }

  const actions: AgentAction[] = [];
  let activeContext: ContextMatch | null = state.activeContext;

  for (const entity of analyzed.entities) {
    const saved = await callTool<{ contextId: string; saved: boolean }>(
      "save_context",
      {
        userId: state.userId,
        type: entity.type,
        key: entity.key,
        data: entity.data,
        source: usedSource,
      },
    );

    activeContext = {
      contextId: saved.contextId,
      type: entity.type,
      key: entity.key,
      data: entity.data,
      createdAt: now(),
    };

    actions.push({
      type: "context_saved",
      summary: `Saved ${entity.key}`,
      at: now(),
    });
  }

  state.activeContext = activeContext;

  const reply = await converse({
    system: RESPONSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `The user received this message and asked you to explain it.\n\n` +
          `Message:\n${userMessage}\n\n` +
          `Extracted summary: ${analyzed.summary}\n\n` +
          `Reply in one or two short spoken sentences.`,
      },
    ],
    temperature: 0.2,
  });

  return {
    reply,
    conversationId: state.conversationId,
    context: activeContext,
    actions,
    pendingConfirmation: null,
  };
}

async function handleFollowUp(
  state: ConversationState,
  message: string,
): Promise<AgentOutput> {
  if (!state.activeContext) {
    return {
      reply:
        "I don't have anything to refer to yet. Tell me what you're looking at and I'll help.",
      conversationId: state.conversationId,
      context: null,
      actions: [],
      pendingConfirmation: null,
    };
  }

  const reply = await converse({
    system: RESPONSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Context (the only source you may use):\n` +
          `${JSON.stringify(state.activeContext.data, null, 2)}\n\n` +
          `User question: ${message}\n\n` +
          `Answer strictly from the context. If the answer is not in the context, ` +
          `say so plainly and do not guess. One or two short sentences.`,
      },
    ],
    temperature: 0.2,
  });

  return {
    reply,
    conversationId: state.conversationId,
    context: state.activeContext,
    actions: [],
    pendingConfirmation: null,
  };
}

async function handleCreateReminder(
  state: ConversationState,
  message: string,
  plan: Plan,
): Promise<AgentOutput> {
  const ctx = await resolveContext(
    state.userId,
    plan.extractedReference,
    state.activeContext,
  );

  // No context yet — remember the request so a follow-up clarification
  // can complete it with the original phrasing intact.
  if (!ctx) {
    state.pendingReminderMessage = message;
    return {
      reply:
        "I'd like to set that reminder, but I'm not sure what it's for. Could you tell me what to remind you about?",
      conversationId: state.conversationId,
      context: null,
      actions: [],
      pendingConfirmation: null,
    };
  }

  // If a previous turn asked "what for?", combine the two messages so
  // the date offset isn't lost. Example: turn 1 "5 days before",
  // turn 2 "for the electricity bill" → parse "5 days before" against
  // the resolved context.
  const combinedMessage = state.pendingReminderMessage
    ? `${state.pendingReminderMessage} ${message}`
    : message;
  state.pendingReminderMessage = null;

  const scheduledAt = parseReminderDate(combinedMessage, ctx);
  const title = deriveReminderTitle(ctx);

  const result = await callTool<{ reminderId: string; success: boolean }>(
    "create_reminder",
    {
      userId: state.userId,
      title,
      scheduledAt,
      relatedContextId: ctx.contextId,
    },
  );

  const prettyDate = new Date(scheduledAt).toLocaleDateString("en-IN", {
    month: "long",
    day: "numeric",
  });

  return {
    reply: `Done. I'll remind you on ${prettyDate}.`,
    conversationId: state.conversationId,
    context: ctx,
    actions: [
      {
        type: "reminder_created",
        summary: `Reminder created for ${prettyDate}`,
        at: now(),
      },
    ],
    pendingConfirmation: null,
  };
}

async function handleDraftMessage(
  state: ConversationState,
  message: string,
  plan: Plan,
): Promise<AgentOutput> {
  const ctx = await resolveContext(
    state.userId,
    plan.extractedReference,
    state.activeContext,
  );

  if (!ctx) {
    return {
      reply:
        "I can send a message, but I need to know what it's about first. Could you tell me what you'd like to share?",
      conversationId: state.conversationId,
      context: null,
      actions: [],
      pendingConfirmation: null,
    };
  }

  const recipient = extractRecipient(message);
  const body = composeMessageFromContext(ctx);

  const draft = await callTool<{
    draftId: string;
    recipient: string;
    message: string;
    requiresConfirmation: true;
    confirmationToken: string;
  }>("draft_family_message", {
    userId: state.userId,
    recipient,
    content: body,
    relatedContextId: ctx.contextId,
  });

  const pending: PendingConfirmation = {
    draftId: draft.draftId,
    confirmationToken: draft.confirmationToken,
    recipient: draft.recipient,
    message: draft.message,
    createdAt: now(),
  };
  state.pendingConfirmation = pending;

  return {
    reply: `I can send your ${recipient} a message saying: "${draft.message}" Should I send it?`,
    conversationId: state.conversationId,
    context: ctx,
    actions: [
      {
        type: "message_drafted",
        summary: `Draft prepared for ${recipient}`,
        at: now(),
      },
    ],
    pendingConfirmation: pending,
  };
}

async function handleConfirmSend(
  state: ConversationState,
  userMessage: string,
): Promise<AgentOutput> {
  const pending = state.pendingConfirmation;
  if (!pending) {
    return {
      reply: "There's nothing waiting to be sent right now.",
      conversationId: state.conversationId,
      context: state.activeContext,
      actions: [],
      pendingConfirmation: null,
    };
  }

  const result = await callTool<{
    sent: boolean;
    draftId: string;
    sentAt?: string;
    rejectionReason?: string;
  }>("send_family_message", {
    userId: state.userId,
    draftId: pending.draftId,
    confirmationToken: pending.confirmationToken,
    userConfirmation: userMessage,
  });

  if (!result.sent) {
    logger.warn("Send rejected by MCP server", {
      draftId: pending.draftId,
      reason: result.rejectionReason,
    });
    return {
      reply:
        "I wasn't able to send that message. Could we try preparing it again?",
      conversationId: state.conversationId,
      context: state.activeContext,
      actions: [],
      pendingConfirmation: pending,
    };
  }

  state.pendingConfirmation = null;

  return {
    reply: `Sent. Your ${pending.recipient} has the message.`,
    conversationId: state.conversationId,
    context: state.activeContext,
    actions: [
      {
        type: "message_sent",
        summary: `Message sent to ${pending.recipient}`,
        at: now(),
      },
    ],
    pendingConfirmation: null,
  };
}

function handleDenySend(state: ConversationState): AgentOutput {
  const pending = state.pendingConfirmation;
  state.pendingConfirmation = null;

  return {
    reply: pending
      ? `No problem. I won't send anything to your ${pending.recipient}.`
      : "Okay, nothing sent.",
    conversationId: state.conversationId,
    context: state.activeContext,
    actions: pending
      ? [
          {
            type: "message_cancelled",
            summary: `Cancelled message to ${pending.recipient}`,
            at: now(),
          },
        ]
      : [],
    pendingConfirmation: null,
  };
}

async function handleRetrieveContext(
  state: ConversationState,
  message: string,
  plan: Plan,
): Promise<AgentOutput> {
  const ctx = await resolveContext(
    state.userId,
    plan.extractedReference,
    state.activeContext,
  );

  if (!ctx) {
    return {
      reply:
        "I don't have anything stored about that. Could you remind me what you're referring to?",
      conversationId: state.conversationId,
      context: null,
      actions: [],
      pendingConfirmation: null,
    };
  }

  state.activeContext = ctx;

  const reply = await converse({
    system: RESPONSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Stored context:\n${JSON.stringify(ctx.data, null, 2)}\n\n` +
          `User question: ${message}\n\n` +
          `Answer in one short spoken sentence using only the stored context.`,
      },
    ],
    temperature: 0.2,
  });

  return {
    reply,
    conversationId: state.conversationId,
    context: ctx,
    actions: [],
    pendingConfirmation: null,
  };
}

async function handleListReminders(
  state: ConversationState,
): Promise<AgentOutput> {
  const result = await callTool<{
    reminders: Array<{
      reminderId: string;
      title: string;
      scheduledAt: string;
      status: string;
    }>;
  }>("get_reminders", { userId: state.userId, status: "active" });

  if (result.reminders.length === 0) {
    return {
      reply: "You don't have any reminders right now.",
      conversationId: state.conversationId,
      context: state.activeContext,
      actions: [],
      pendingConfirmation: null,
    };
  }

  const lines = result.reminders
    .slice(0, 5)
    .map((r) => {
      const d = new Date(r.scheduledAt).toLocaleDateString("en-IN", {
        month: "long",
        day: "numeric",
      });
      return `${r.title} on ${d}`;
    })
    .join("; ");

  return {
    reply: `You have ${result.reminders.length} reminder${
      result.reminders.length === 1 ? "" : "s"
    }: ${lines}.`,
    conversationId: state.conversationId,
    context: state.activeContext,
    actions: [],
    pendingConfirmation: null,
  };
}

async function handleUnknown(
  state: ConversationState,
  message: string,
): Promise<AgentOutput> {
  const reply = await converse({
    system: RESPONSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `The user said: "${message}"\n\n` +
          `You are not sure what they want. Ask one short, friendly clarifying ` +
          `question offering the things you can help with: explaining a message, ` +
          `setting a reminder, or telling a family member about something.`,
      },
    ],
    temperature: 0.4,
  });

  return {
    reply,
    conversationId: state.conversationId,
    context: state.activeContext,
    actions: [],
    pendingConfirmation: null,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseReminderDate(
  message: string,
  context: ContextMatch | null,
): string {
  const ctxData = context?.data as Record<string, unknown> | undefined;
  const ctxDue = ctxData?.dueDate as string | undefined;

  // ── 1. "N days before" (or "N days before the due date") ─────────
  if (ctxDue && /\bdays?\s+before\b/i.test(message)) {
    const wordToNum: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const match = message.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\s+before\b/i,
    );
    if (match) {
      const raw = match[1].toLowerCase();
      const days = /^\d+$/.test(raw) ? Number(raw) : (wordToNum[raw] ?? 0);
      if (days > 0) {
        const base = new Date(`${ctxDue}T09:00:00Z`);
        if (!Number.isNaN(base.getTime())) {
          base.setUTCDate(base.getUTCDate() - days);
          return base.toISOString();
        }
      }
    }
  }

  // ── 2. Anchor for day-of-month parsing ───────────────────────────
  // Prefer the context's due date as the reference month.
  let reference = new Date();
  if (ctxDue) {
    const parsed = new Date(`${ctxDue}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) reference = parsed;
  }

  // ── 3. "on the Nth" / "on Nth" ───────────────────────────────────
  const dayMatch = message.match(
    /\b(?:on\s+the\s+|on\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );

  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      const isToday =
        day === now.getUTCDate() &&
        reference.getUTCMonth() === now.getUTCMonth() &&
        reference.getUTCFullYear() === now.getUTCFullYear();

      // "Remind me on the 26th" said on the 26th → one hour from now.
      if (isToday) {
        const soon = new Date(now.getTime() + 60 * 60 * 1000);
        soon.setUTCSeconds(0, 0);
        return soon.toISOString();
      }

      const candidate = new Date(
        Date.UTC(
          reference.getUTCFullYear(),
          reference.getUTCMonth(),
          day,
          9,
          0,
          0,
          0,
        ),
      );

      // If the candidate is more than a day in the past, roll forward a month.
      if (candidate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        candidate.setUTCMonth(candidate.getUTCMonth() + 1);
      }

      return candidate.toISOString();
    }
  }

  // ── 4. "tomorrow" ────────────────────────────────────────────────
  if (/\btomorrow\b/i.test(message)) {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(9, 0, 0, 0);
    return t.toISOString();
  }

  // ── 5. Fallback: tomorrow at 9 AM UTC ────────────────────────────
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + 1);
  fallback.setUTCHours(9, 0, 0, 0);
  return fallback.toISOString();
}

function deriveReminderTitle(ctx: ContextMatch): string {
  const data = ctx.data as Record<string, unknown>;
  if (ctx.type === "bill") {
    const provider = (data.provider as string) ?? "Bill";
    return `Pay ${provider} bill`;
  }
  return `Follow up: ${ctx.key}`;
}

function composeMessageFromContext(ctx: ContextMatch): string {
  const data = ctx.data as Record<string, unknown>;

  if (ctx.type === "bill") {
    const amount = data.amount as number | undefined;
    const currency = (data.currency as string) ?? "INR";
    const dueDate = data.dueDate as string | undefined;
    const prettyAmount =
      amount !== undefined
        ? `₹${amount.toLocaleString("en-IN")}`
        : "an amount I owe";
    const prettyDue = dueDate
      ? new Date(dueDate).toLocaleDateString("en-IN", {
          month: "long",
          day: "numeric",
        })
      : "soon";
    return `My electricity bill is ${prettyAmount} and it's due ${prettyDue}.`;
  }

  return `I wanted to let you know about ${ctx.key}.`;
}
