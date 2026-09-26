import * as z from 'zod/v4';

// ─────────────────────────────────────────────────────────────
// Tool 1 — analyze_message
// ─────────────────────────────────────────────────────────────

export const AnalyzeMessageInput = z.object({
  content: z
    .string()
    .min(1)
    .describe('The raw text of the message or document to analyze'),
  source: z
    .string()
    .describe(
      'Where this content came from, e.g. "sms", "email", "uploaded_pdf"',
    ),
});

export const AnalyzeMessageOutput = z.object({
  summary: z.string().describe('One-sentence plain-language summary'),
  facts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .describe('Key facts extracted from the source'),
  entities: z
    .array(
      z.object({
        type: z
          .string()
          .describe('e.g. "bill", "appointment", "deadline"'),
        key: z.string().describe('Stable identifier, e.g. "electricity_bill"'),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .describe('Structured entities suitable for save_context'),
  questionsAnswerableFromSource: z
    .array(z.string())
    .describe(
      'Questions the agent can answer using ONLY this source. Anything not listed here must not be guessed.',
    ),
});

// ─────────────────────────────────────────────────────────────
// Tool 2 — get_context
// ─────────────────────────────────────────────────────────────

export const GetContextInput = z.object({
  userId: z.string().describe('The user whose context is being retrieved'),
  query: z
    .string()
    .describe(
      'Natural-language or key-based query, e.g. "electricity bill" or "that bill"',
    ),
  type: z
    .enum(['bill', 'appointment', 'document', 'general'])
    .optional()
    .describe('Restrict search to a known context type'),
});

export const GetContextOutput = z.object({
  matches: z.array(
    z.object({
      contextId: z.string(),
      type: z.string(),
      key: z.string(),
      data: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
});

// ─────────────────────────────────────────────────────────────
// Tool 3 — save_context
// ─────────────────────────────────────────────────────────────

export const SaveContextInput = z.object({
  userId: z.string(),
  type: z.enum(['bill', 'appointment', 'document', 'general']),
  key: z
    .string()
    .min(1)
    .describe('Stable identifier, e.g. "electricity_bill"'),
  data: z
    .record(z.string(), z.unknown())
    .describe('The authorized fact payload. Do not include sensitive fields the user did not approve.'),
  source: z.string().describe('Provenance, e.g. the originating message id'),
  ttlDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional expiry in days. Omit for indefinite retention.'),
});

export const SaveContextOutput = z.object({
  contextId: z.string(),
  saved: z.boolean(),
});

// ─────────────────────────────────────────────────────────────
// Tool 4 — create_reminder
// ─────────────────────────────────────────────────────────────

export const CreateReminderInput = z.object({
  userId: z.string(),
  title: z.string().min(1),
  scheduledAt: z
    .string()
    .describe('ISO 8601 datetime with timezone offset, e.g. 2026-09-26T09:00:00+05:30'),
  relatedContextId: z.string().optional(),
});

export const CreateReminderOutput = z.object({
  reminderId: z.string(),
  success: z.boolean(),
});

// ─────────────────────────────────────────────────────────────
// Tool 5 — get_reminders
// ─────────────────────────────────────────────────────────────

export const GetRemindersInput = z.object({
  userId: z.string(),
  status: z.enum(['active', 'completed', 'cancelled']).default('active'),
});

export const GetRemindersOutput = z.object({
  reminders: z.array(
    z.object({
      reminderId: z.string(),
      title: z.string(),
      scheduledAt: z.string(),
      status: z.string(),
    }),
  ),
});

// ─────────────────────────────────────────────────────────────
// Tool 6 — draft_family_message
// ─────────────────────────────────────────────────────────────

export const DraftFamilyMessageInput = z.object({
  userId: z.string(),
  recipient: z
    .string()
    .describe('Relationship or name, e.g. "daughter"'),
  content: z.string().min(1).describe('The proposed message body'),
  relatedContextId: z.string().optional(),
});

export const DraftFamilyMessageOutput = z.object({
  draftId: z.string(),
  recipient: z.string(),
  message: z.string(),
  requiresConfirmation: z.literal(true),
  confirmationToken: z
    .string()
    .describe(
      'Opaque token. Must be passed back to send_family_message after the user confirms.',
    ),
});

// ─────────────────────────────────────────────────────────────
// Tool 7 — send_family_message
// ─────────────────────────────────────────────────────────────

export const SendFamilyMessageInput = z.object({
  userId: z.string(),
  draftId: z.string(),
  confirmationToken: z
    .string()
    .describe(
      'The token issued when the draft was created. Proves the send follows a real draft.',
    ),
  userConfirmation: z
    .string()
    .describe('The literal words the user used to confirm, e.g. "yes"'),
});

export const SendFamilyMessageOutput = z.object({
  sent: z.boolean(),
  draftId: z.string(),
  sentAt: z.string().optional(),
  rejectionReason: z.string().optional(),
});