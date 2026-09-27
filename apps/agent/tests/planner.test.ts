import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/llm/index.js', () => ({
  converse: vi.fn(),
  converseJson: vi.fn(),
  getProvider: vi.fn(),
  availableProviders: vi.fn(() => ['openai']),
}));

import { converseJson } from '../src/lib/llm/index.js';
import { plan } from '../src/agent/planner.js';
import type { ConversationState, PendingConfirmation } from '../src/models/schemas.js';

const mockConverseJson = vi.mocked(converseJson);

const PENDING: PendingConfirmation = {
  draftId: 'd-1',
  confirmationToken: 'tok-abc',
  recipient: 'daughter',
  message: 'My bill is due.',
  createdAt: '2026-09-27T07:00:00Z',
};

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'c-1',
    userId: 'u1',
    recentTurns: [],
    activeContext: null,
    pendingConfirmation: null,
    pendingReminderMessage: null,
    createdAt: '2026-09-27T07:00:00Z',
    updatedAt: '2026-09-27T07:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockConverseJson.mockReset();
});

describe('planner confirmation short-circuit', () => {
  it('routes "yes" to CONFIRM_SEND without consulting the LLM', async () => {
    const result = await plan('Yes.', makeState({ pendingConfirmation: PENDING }));
    expect(result.intent).toBe('CONFIRM_SEND');
    expect(mockConverseJson).not.toHaveBeenCalled();
  });

  it('routes "sure" to CONFIRM_SEND without consulting the LLM', async () => {
    const result = await plan('sure', makeState({ pendingConfirmation: PENDING }));
    expect(result.intent).toBe('CONFIRM_SEND');
    expect(mockConverseJson).not.toHaveBeenCalled();
  });

  it('routes "no" to DENY_SEND without consulting the LLM', async () => {
    const result = await plan('No.', makeState({ pendingConfirmation: PENDING }));
    expect(result.intent).toBe('DENY_SEND');
    expect(mockConverseJson).not.toHaveBeenCalled();
  });

  it('routes "cancel" to DENY_SEND without consulting the LLM', async () => {
    const result = await plan('cancel', makeState({ pendingConfirmation: PENDING }));
    expect(result.intent).toBe('DENY_SEND');
    expect(mockConverseJson).not.toHaveBeenCalled();
  });

  it('falls through to the LLM when the reply is neither yes nor no', async () => {
    mockConverseJson.mockResolvedValueOnce({
      intent: 'FOLLOW_UP',
      reasoning: 'asked a question',
      extractedReference: null,
    });

    const result = await plan(
      'What time is it?',
      makeState({ pendingConfirmation: PENDING }),
    );

    expect(result.intent).toBe('FOLLOW_UP');
    expect(mockConverseJson).toHaveBeenCalledOnce();
  });
});

describe('planner default path', () => {
  it('passes the LLM result through when no confirmation is pending', async () => {
    mockConverseJson.mockResolvedValueOnce({
      intent: 'UNDERSTAND_MESSAGE',
      reasoning: 'user received a message',
      extractedReference: null,
    });

    const result = await plan('I dont understand this', makeState());
    expect(result.intent).toBe('UNDERSTAND_MESSAGE');
    expect(mockConverseJson).toHaveBeenCalledOnce();
  });

  it('returns UNKNOWN when the LLM call fails', async () => {
    mockConverseJson.mockRejectedValueOnce(new Error('provider down'));

    const result = await plan('Hello', makeState());
    expect(result.intent).toBe('UNKNOWN');
    expect(result.reasoning).toMatch(/planner failure/i);
  });
});