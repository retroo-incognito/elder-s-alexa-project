export interface ContextMatch {
  contextId: string;
  type: string;
  key: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyzeMessageResult {
  summary: string;
  facts: Array<{ label: string; value: string }>;
  entities: Array<{
    type: string;
    key: string;
    data: Record<string, unknown>;
  }>;
  questionsAnswerableFromSource: string[];
}

export interface PendingConfirmation {
  draftId: string;
  confirmationToken: string;
  recipient: string;
  message: string;
  createdAt: string;
}

export interface ConversationState {
  conversationId: string;
  userId: string;
  recentTurns: Array<{ role: 'user' | 'agent'; text: string; at: string }>;
  activeContext: ContextMatch | null;
  pendingConfirmation: PendingConfirmation | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAction {
  type:
    | 'context_saved'
    | 'reminder_created'
    | 'message_drafted'
    | 'message_sent'
    | 'message_cancelled';
  summary: string;
  at: string;
}

export interface AgentInput {
  userId: string;
  conversationId: string;
  message: string;
}

export interface AgentOutput {
  reply: string;
  conversationId: string;
  context: ContextMatch | null;
  actions: AgentAction[];
  pendingConfirmation: PendingConfirmation | null;
}

export type Intent =
  | 'UNDERSTAND_MESSAGE'
  | 'FOLLOW_UP'
  | 'CREATE_REMINDER'
  | 'DRAFT_MESSAGE'
  | 'CONFIRM_SEND'
  | 'DENY_SEND'
  | 'RETRIEVE_CONTEXT'
  | 'LIST_REMINDERS'
  | 'UNKNOWN';

export interface Plan {
  intent: Intent;
  reasoning: string;
  extractedReference: string | null;
}