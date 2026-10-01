import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/mcp-client.js', () => ({
  callTool: vi.fn(),
  disconnect: vi.fn(),
}));

import { callTool } from '../src/lib/mcp-client.js';
import { resolveContext, extractRecipient } from '../src/agent/context.js';
import type { ContextMatch } from '../src/models/schemas.js';

const mockCallTool = vi.mocked(callTool);

const ACTIVE_BILL: ContextMatch = {
  contextId: 'ctx-active',
  type: 'bill',
  key: 'electricity_bill',
  data: { amount: 1842, dueDate: '2026-10-15' },
  createdAt: '2026-09-27T07:00:00Z',
};

beforeEach(() => {
  mockCallTool.mockReset();
});

describe('extractRecipient', () => {
  it('extracts "daughter" from "tell my daughter about it"', () => {
    expect(extractRecipient('tell my daughter about it')).toBe('daughter');
  });

  it('extracts a name when no possessive is used', () => {
    expect(extractRecipient('tell Priya about the bill')).toBe('priya');
  });

  it('handles "message my son"', () => {
    expect(extractRecipient('message my son')).toBe('son');
  });

  it('handles "text my wife"', () => {
    expect(extractRecipient('text my wife the details')).toBe('wife');
  });

  it('returns null when no recipient is found', () => {
    expect(extractRecipient('do it')).toBeNull();
  });
});

describe('resolveContext', () => {
  it('returns the active context when the reference is vague', async () => {
    const result = await resolveContext('u1', 'it', ACTIVE_BILL);
    expect(result).toBe(ACTIVE_BILL);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('returns the active context when the reference names its type', async () => {
    const result = await resolveContext('u1', 'that bill', ACTIVE_BILL);
    expect(result).toBe(ACTIVE_BILL);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('returns the active context when the reference names its key', async () => {
    const result = await resolveContext(
      'u1',
      'electricity_bill',
      ACTIVE_BILL,
    );
    expect(result).toBe(ACTIVE_BILL);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('looks up via get_context when the reference is specific and not active', async () => {
    const stored: ContextMatch = {
      contextId: 'ctx-old',
      type: 'bill',
      key: 'phone_bill',
      data: { amount: 500 },
      createdAt: '2026-09-20T07:00:00Z',
    };
    mockCallTool.mockResolvedValueOnce({ matches: [stored] });

    const result = await resolveContext('u1', 'phone bill', null);

    expect(result).toBe(stored);
    expect(mockCallTool).toHaveBeenCalledWith('get_context', {
      userId: 'u1',
      query: 'phone bill',
    });
  });

  it('falls back to the active context when the lookup returns nothing', async () => {
    mockCallTool.mockResolvedValueOnce({ matches: [] });
    const result = await resolveContext('u1', 'phone bill', ACTIVE_BILL);
    expect(result).toBe(ACTIVE_BILL);
  });

  it('returns null when there is no active context and no match', async () => {
    mockCallTool.mockResolvedValueOnce({ matches: [] });
    const result = await resolveContext('u1', 'phone bill', null);
    expect(result).toBeNull();
  });

  it('returns the active context when no reference and no lookup is possible', async () => {
    const result = await resolveContext('u1', null, ACTIVE_BILL);
    expect(result).toBe(ACTIVE_BILL);
    expect(mockCallTool).not.toHaveBeenCalled();
  });
});