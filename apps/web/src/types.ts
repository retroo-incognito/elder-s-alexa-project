export interface ContextMatch {
  contextId: string;
  type: string;
  key: string;
  data: Record<string, unknown>;
  createdAt: string;
  sourceContent?: string;
}

export type ActionType =
  | 'context_saved'
  | 'reminder_created'
  | 'message_drafted'
  | 'message_sent'
  | 'message_cancelled';

export interface AgentAction {
  type: ActionType;
  summary: string;
  at: string;
}

export interface PendingConfirmation {
  draftId: string;
  confirmationToken: string;
  recipient: string;
  message: string;
  createdAt: string;
}

export interface AgentResponse {
  reply: string;
  conversationId: string;
  context: ContextMatch | null;
  actions: AgentAction[];
  pendingConfirmation: PendingConfirmation | null;
}

export interface Turn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: string;
  error?: boolean;
}