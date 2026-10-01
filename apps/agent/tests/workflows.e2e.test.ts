import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────
// Mocks — must be hoisted above the imports they affect
// ─────────────────────────────────────────────────────────────

vi.mock('../src/lib/mcp-client.js', () => ({
  callTool: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../src/lib/llm/index.js', () => ({
  converse: vi.fn(),
  converseJson: vi.fn(),
  getProvider: vi.fn(),
  availableProviders: vi.fn(() => ['openai']),
}));

import { callTool } from '../src/lib/mcp-client.js';
import { converse, converseJson } from '../src/lib/llm/index.js';
import { handleMessage } from '../src/agent/orchestrator.js';

const mockCallTool = vi.mocked(callTool);
const mockConverse = vi.mocked(converse);
const mockConverseJson = vi.mocked(converseJson);

const USER = 'test-user';

// Each test gets a unique conversation ID so module-level state
// in the orchestrator never leaks between tests.
function freshConv(): string {
  return `conv-${randomUUID()}`;
}

function planResponse(
  intent: string,
  extractedReference: string | null = null,
): unknown {
  return {
    intent,
    reasoning: `test intent: ${intent}`,
    extractedReference,
  };
}

// ─────────────────────────────────────────────────────────────
// Reusable tool-mock scenarios
// ─────────────────────────────────────────────────────────────

const BILL_ANALYSIS = {
  summary: 'Electricity bill is ₹1,842, due October 15.',
  facts: [
    { label: 'Provider', value: 'Electricity Company' },
    { label: 'Amount', value: '₹1,842' },
    { label: 'Due date', value: 'October 15' },
  ],
  entities: [
    {
      type: 'bill',
      key: 'electricity_bill',
      data: {
        provider: 'Electricity Company',
        amount: 1842,
        currency: 'INR',
        dueDate: '2026-10-15',
      },
    },
  ],
  questionsAnswerableFromSource: ['What is the amount?', 'When is it due?'],
};

function setupUnderstandPath(): void {
  // Planner → UNDERSTAND_MESSAGE
  mockConverseJson.mockResolvedValueOnce(
    planResponse('UNDERSTAND_MESSAGE'),
  );

  // MCP tools for understand
  mockCallTool.mockImplementation(async (name) => {
    if (name === 'scan_threat') {
      return {
        risk: 'low',
        signals: [],
        reasoning: 'No threat detected',
        blockActions: false,
        allowListed: false,
      };
    }
    if (name === 'analyze_message') return BILL_ANALYSIS;
    if (name === 'save_context')
      return { contextId: 'ctx-1', saved: true };
    throw new Error(`Unexpected tool call: ${name}`);
  });

  // Response generation
  mockConverse.mockResolvedValueOnce(
    'It says your electricity bill is ₹1,842 and payment is due October 15.',
  );
}

beforeEach(() => {
  mockCallTool.mockReset();
  mockConverse.mockReset();
  mockConverseJson.mockReset();
});

// ─────────────────────────────────────────────────────────────
// Test A — message → extraction → explanation
// ─────────────────────────────────────────────────────────────

describe('Test A — message understanding', () => {
  it('extracts the bill, saves context, and explains it', async () => {
    setupUnderstandPath();
    const conv = freshConv();

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message:
        "I got a message from the electricity company. I don't understand it.",
    });

    expect(result.context).not.toBeNull();
    expect(result.context?.key).toBe('electricity_bill');
    expect(result.context?.data.amount).toBe(1842);
    expect(result.context?.data.dueDate).toBe('2026-10-15');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('context_saved');

    expect(result.pendingConfirmation).toBeNull();
    expect(result.reply).toContain('1,842');
  });
});

// ─────────────────────────────────────────────────────────────
// Test B — message → save → later retrieval
// ─────────────────────────────────────────────────────────────

describe('Test B — persistent context across conversations', () => {
  it('resolves "that bill" in a fresh conversation via get_context', async () => {
    mockConverseJson.mockResolvedValueOnce(
      planResponse('RETRIEVE_CONTEXT', 'that bill'),
    );

    mockCallTool.mockImplementation(async (name) => {
      if (name === 'get_context') {
        return {
          matches: [
            {
              contextId: 'ctx-1',
              type: 'bill',
              key: 'electricity_bill',
              data: {
                provider: 'Electricity Company',
                amount: 1842,
                currency: 'INR',
                dueDate: '2026-10-15',
              },
              createdAt: '2026-09-27T07:00:00Z',
            },
          ],
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    mockConverse.mockResolvedValueOnce(
      'It was your electricity bill for ₹1,842, due October 15.',
    );

    const result = await handleMessage({
      userId: USER,
      conversationId: freshConv(), // brand-new conversation
      message: 'What was that bill I was worried about yesterday?',
    });

    expect(result.context).not.toBeNull();
    expect(result.context?.key).toBe('electricity_bill');
    expect(result.context?.data.amount).toBe(1842);
    expect(result.reply).toContain('1,842');

    // Verify the agent used get_context, not local state
    const callNames = mockCallTool.mock.calls.map((c) => c[0]);
    expect(callNames).toContain('get_context');
  });
});

// ─────────────────────────────────────────────────────────────
// Test C — message → reminder
// ─────────────────────────────────────────────────────────────

describe('Test C — reminder creation', () => {
  it('creates a reminder tied to the active context', async () => {
    const conv = freshConv();

    // Step 1: understand
    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: "I don't understand this message.",
    });

    // Step 2: remind
    mockConverseJson.mockResolvedValueOnce(planResponse('CREATE_REMINDER'));

    let capturedArgs: Record<string, unknown> | null = null;
    mockCallTool.mockImplementation(async (name, args) => {
      if (name === 'create_reminder') {
        capturedArgs = args as Record<string, unknown>;
        return { reminderId: 'rem-1', success: true };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Remind me on the 10th.',
    });

    expect(capturedArgs).not.toBeNull();
    expect(capturedArgs!.userId).toBe(USER);
    expect(capturedArgs!.title).toMatch(/electricity/i);
    expect(capturedArgs!.relatedContextId).toBe('ctx-1');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('reminder_created');
    expect(result.reply).toMatch(/remind you/i);
  });
});

// ─────────────────────────────────────────────────────────────
// Test D — message → draft → confirmation → send
// ─────────────────────────────────────────────────────────────

describe('Test D — draft, confirm, send', () => {
  it('drafts and waits for confirmation, then sends after yes', async () => {
    const conv = freshConv();

    // Step 1: understand
    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Explain this message.',
    });

    // Step 2: draft
    mockConverseJson.mockResolvedValueOnce(
      planResponse('DRAFT_MESSAGE', 'that bill'),
    );
    mockCallTool.mockImplementation(async (name) => {
      if (name === 'resolve_contact') {
        return {
          found: true,
          contact: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          suggestions: [],
        };
      }
      if (name === 'draft_family_message') {
        return {
          draftId: 'd-1',
          recipient: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          message: "My electricity bill is ₹1,842 and it's due 15 October.",
          requiresConfirmation: true,
          confirmationToken: 'tok-abc',
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const draftResult = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'And tell my daughter about it.',
    });

    // Safety: draft created, nothing sent
    expect(draftResult.pendingConfirmation).not.toBeNull();
    expect(draftResult.pendingConfirmation?.draftId).toBe('d-1');
    expect(draftResult.pendingConfirmation?.confirmationToken).toBe('tok-abc');
    expect(draftResult.actions.map((a) => a.type)).toEqual([
      'message_drafted',
    ]);

    // Step 3: confirm
    mockConverseJson.mockResolvedValueOnce(planResponse('CONFIRM_SEND'));

    let sendArgs: Record<string, unknown> | null = null;
    mockCallTool.mockImplementation(async (name, args) => {
      if (name === 'send_family_message') {
        sendArgs = args as Record<string, unknown>;
        return {
          sent: true,
          draftId: 'd-1',
          sentAt: new Date().toISOString(),
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const sendResult = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Yes.',
    });

    expect(sendArgs).not.toBeNull();
    expect(sendArgs!.draftId).toBe('d-1');
    expect(sendArgs!.confirmationToken).toBe('tok-abc');
    expect(sendArgs!.userConfirmation).toBe('Yes.');

    expect(sendResult.actions.map((a) => a.type)).toEqual(['message_sent']);
    expect(sendResult.pendingConfirmation).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Test E — THE SAFETY TEST
// ─────────────────────────────────────────────────────────────

describe('Test E — send without confirmation MUST NOT SEND', () => {
  it('drafts but never calls send_family_message when the user has not said yes', async () => {
    const conv = freshConv();

    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Explain this message.',
    });

    mockConverseJson.mockResolvedValueOnce(
      planResponse('DRAFT_MESSAGE', null),
    );

    const calledTools: string[] = [];
    mockCallTool.mockImplementation(async (name) => {
      calledTools.push(name);
      if (name === 'resolve_contact') {
        return {
          found: true,
          contact: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          suggestions: [],
        };
      }
      if (name === 'draft_family_message') {
        return {
          draftId: 'd-1',
          recipient: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          message: 'My bill is due.',
          requiresConfirmation: true,
          confirmationToken: 'tok-abc',
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Tell my daughter about it.',
    });

    // Safety: drafted, pending, and send_family_message was NEVER called
    expect(calledTools).not.toContain('send_family_message');
    expect(result.pendingConfirmation).not.toBeNull();
    expect(result.actions.some((a) => a.type === 'message_sent')).toBe(false);
  });

  it('keeps the draft pending when the MCP server rejects the send', async () => {
    const conv = freshConv();

    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Explain this message.',
    });

    mockConverseJson.mockResolvedValueOnce(
      planResponse('DRAFT_MESSAGE', null),
    );
    mockCallTool.mockImplementation(async (name) => {
      if (name === 'resolve_contact') {
        return {
          found: true,
          contact: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          suggestions: [],
        };
      }
      if (name === 'draft_family_message') {
        return {
          draftId: 'd-1',
          recipient: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          message: 'X',
          requiresConfirmation: true,
          confirmationToken: 'tok-abc',
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Tell my daughter.',
    });

    // User says yes, but the MCP server rejects (e.g. stale token)
    mockConverseJson.mockResolvedValueOnce(planResponse('CONFIRM_SEND'));
    mockCallTool.mockImplementation(async (name) => {
      if (name === 'send_family_message') {
        return {
          sent: false,
          draftId: 'd-1',
          rejectionReason: 'Confirmation token does not match.',
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Yes.',
    });

    // No message sent; pending confirmation preserved for retry
    expect(result.actions.some((a) => a.type === 'message_sent')).toBe(false);
    expect(result.pendingConfirmation).not.toBeNull();
    expect(result.reply).toMatch(/wasn't able to send|try again/i);
  });

  it('clears the pending confirmation when the user says no', async () => {
    const conv = freshConv();

    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Explain this message.',
    });

    mockConverseJson.mockResolvedValueOnce(
      planResponse('DRAFT_MESSAGE', null),
    );
    mockCallTool.mockImplementation(async (name) => {
      if (name === 'resolve_contact') {
        return {
          found: true,
          contact: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          suggestions: [],
        };
      }
      if (name === 'draft_family_message') {
        return {
          draftId: 'd-1',
          recipient: {
            contactId: 'c1',
            displayName: 'Priya',
            relationship: 'daughter',
            channel: 'whatsapp',
            address: '+1234567890',
          },
          message: 'X',
          requiresConfirmation: true,
          confirmationToken: 'tok-abc',
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Tell my daughter.',
    });

    // User says no
    mockConverseJson.mockResolvedValueOnce(planResponse('DENY_SEND'));
    mockCallTool.mockImplementation(async (name) => {
      throw new Error(`No tools should be called on deny, got: ${name}`);
    });

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'No.',
    });

    expect(result.pendingConfirmation).toBeNull();
    expect(result.actions.map((a) => a.type)).toEqual(['message_cancelled']);
  });
});

// ─────────────────────────────────────────────────────────────
// Test F — unknown information MUST NOT hallucinate
// ─────────────────────────────────────────────────────────────

describe('Test F — no hallucination from unknown information', () => {
  it('says the source does not contain the answer instead of inventing one', async () => {
    const conv = freshConv();

    setupUnderstandPath();
    await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'Explain this message.',
    });

    // Follow-up about something not in the source
    mockConverseJson.mockResolvedValueOnce(
      planResponse('FOLLOW_UP', null),
    );
    mockConverse.mockResolvedValueOnce(
      "The message doesn't say what happens after the deadline. I don't want to guess.",
    );

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'What is the late fee if I miss the deadline?',
    });

    // The reply must signal "I don't know"
    expect(result.reply).toMatch(
      /doesn't say|don't know|not (?:in|mentioned)|can't confirm|no information/i,
    );

    // And must NOT contain a fabricated rupee amount beyond the original 1,842
    const fabricatedAmounts = result.reply.match(/₹\s*[\d,]+/g) ?? [];
    expect(fabricatedAmounts).not.toContain('₹500');
    expect(fabricatedAmounts).not.toContain('₹100');
    expect(fabricatedAmounts).not.toContain('₹50');
  });

  it('refuses to answer a follow-up when there is no active context', async () => {
    const conv = freshConv();

    mockConverseJson.mockResolvedValueOnce(
      planResponse('FOLLOW_UP', null),
    );

    const result = await handleMessage({
      userId: USER,
      conversationId: conv,
      message: 'What happens if I miss the deadline?',
    });

    expect(result.context).toBeNull();
    expect(result.reply).toMatch(/don't have anything|tell me what/i);
    expect(mockCallTool).not.toHaveBeenCalled();
  });
});