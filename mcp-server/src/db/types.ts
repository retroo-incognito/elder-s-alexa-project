export type UserId = string;

export interface UserProfile {
  userId: UserId;
  displayName: string;
  timezone: string;
  preferences: Record<string, unknown>;
  createdAt: string; // ISO 8601
}
/**
 * Context type. The extractor produces these dynamically — the list
 * below is documentation, not enforcement. Any short non-empty string
 * is accepted. Known values from the extraction prompt:
 *
 *   bill, appointment, event, notice, delivery, statement,
 *   subscription, insurance, circular, document, general
 */
export type ContextType = string;

export interface ContextRecord {
  userId: UserId;
  contextId: string;
  type: ContextType;
  key: string; // e.g. "electricity_bill"
  data: Record<string, unknown>;
  source: string; // where it came from (message id, upload name)
  createdAt: string;
  expiresAt?: number; // epoch seconds — TTL
}

export type ReminderStatus = 'active' | 'completed' | 'cancelled';

export interface ReminderRecord {
  userId: UserId;
  reminderId: string;
  title: string;
  scheduledAt: string; // ISO 8601 with timezone offset
  status: ReminderStatus;
  relatedContextId?: string;
  createdAt: string;
}

export type DraftStatus = 'draft' | 'confirmed' | 'sent' | 'cancelled';

export interface MessageDraftRecord {
  userId: UserId;
  draftId: string;
  recipient: string;
  content: string;
  status: DraftStatus;
  relatedContextId?: string;
  createdAt: string;
  confirmedAt?: string;
  sentAt?: string;
}

export interface ConversationRecord {
  userId: UserId;
  conversationId: string;
  recentTurns: Array<{
    role: 'user' | 'agent';
    text: string;
    at: string;
  }>;
  activeContextIds: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: number; // TTL — conversations expire after ~30 days
}

export interface MessageDraftRecord {
  userId: UserId;
  draftId: string;
  recipient: string;
  content: string;
  status: DraftStatus;
  relatedContextId?: string;
  confirmationToken?: string;   // ← ADD THIS
  createdAt: string;
  confirmedAt?: string;
  sentAt?: string;
}

export interface ContactRecord {
  userId: UserId;
  contactId: string;
  /** The word the user says: "sister", "daughter", "Priya". */
  relationship: string;
  /** The real name shown to the user: "Priya Sharma". */
  displayName: string;
  /** "whatsapp" | "sms" | "email" | any channel string. */
  channel: string;
  /** Phone number, email address, or handle. */
  address: string;
  createdAt: string;
}

