import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// ─────────────────────────────────────────────────────────────
// Mock the DB layer so we test tool logic, not DynamoDB
// ─────────────────────────────────────────────────────────────

vi.mock('../src/db/contexts.js', () => ({
  saveContext: vi.fn(),
  getContextByKey: vi.fn(),
  getContextById: vi.fn(),
  findRecentByType: vi.fn(),
  deleteContext: vi.fn(),
}));

vi.mock('../src/db/reminders.js', () => ({
  createReminder: vi.fn(),
  getReminders: vi.fn(),
  cancelReminder: vi.fn(),
}));

vi.mock('../src/db/drafts.js', () => ({
  createDraft: vi.fn(),
  getDraft: vi.fn(),
  markConfirmed: vi.fn(),
  markSent: vi.fn(),
  attachConfirmationToken: vi.fn(),
  listRecentDrafts: vi.fn(),
}));

import { buildServer } from '../src/build-server.js';
import * as contexts from '../src/db/contexts.js';
import * as reminders from '../src/db/reminders.js';
import * as drafts from '../src/db/drafts.js';

const mockContexts = vi.mocked(contexts);
const mockReminders = vi.mocked(reminders);
const mockDrafts = vi.mocked(drafts);

// ─────────────────────────────────────────────────────────────
// Test harness: real MCP client + server, wired in-memory
// ─────────────────────────────────────────────────────────────

async function withClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const server = buildServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

interface ToolResult {
  structuredContent?: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
// analyze_message — no DB dependency
// ─────────────────────────────────────────────────────────────

describe('analyze_message', () => {
  it('extracts amount and due date from an electricity bill', async () => {
    await withClient(async (client) => {
      const result = await call(client, 'analyze_message', {
        content: 'Electricity bill of ₹1,842. Payment due September 28.',
        source: 'test',
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent!;
      expect(sc.entities).toHaveLength(1);

      const entity = (sc.entities as Array<{ key: string; data: Record<string, unknown> }>)[0];
      expect(entity.key).toBe('electricity_bill');
      expect(entity.data.amount).toBe(1842);
      expect(entity.data.currency).toBe('INR');
      expect(entity.data.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('returns an empty result for unrecognized content', async () => {
    await withClient(async (client) => {
      const result = await call(client, 'analyze_message', {
        content: 'Hello, how are you?',
        source: 'test',
      });

      const sc = result.structuredContent!;
      expect(sc.entities).toEqual([]);
      expect(sc.facts).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// save_context / get_context
// ─────────────────────────────────────────────────────────────

describe('save_context and get_context', () => {
  it('saves and returns a context record', async () => {
    mockContexts.saveContext.mockResolvedValueOnce({
      userId: 'u1',
      contextId: 'ctx-1',
      type: 'bill',
      key: 'electricity_bill',
      data: { amount: 1842 },
      source: 'test',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'save_context', {
        userId: 'u1',
        type: 'bill',
        key: 'electricity_bill',
        data: { amount: 1842 },
        source: 'test',
      });

      expect(result.structuredContent).toEqual({
        contextId: 'ctx-1',
        saved: true,
      });
    });
  });

  it('get_context returns the exact key match first', async () => {
    mockContexts.getContextByKey.mockResolvedValueOnce({
      userId: 'u1',
      contextId: 'ctx-1',
      type: 'bill',
      key: 'electricity_bill',
      data: { amount: 1842 },
      source: 'test',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'get_context', {
        userId: 'u1',
        query: 'electricity bill',
      });

      const sc = result.structuredContent!;
      const matches = sc.matches as Array<{ contextId: string }>;
      expect(matches).toHaveLength(1);
      expect(matches[0].contextId).toBe('ctx-1');
    });
  });

  it('get_context falls back to fuzzy type search when no exact key matches', async () => {
    mockContexts.getContextByKey.mockResolvedValueOnce(null);
    mockContexts.findRecentByType.mockResolvedValueOnce([
      {
        userId: 'u1',
        contextId: 'ctx-recent',
        type: 'bill',
        key: 'phone_bill',
        data: { amount: 500 },
        source: 'test',
        createdAt: '2026-09-20T07:00:00Z',
      },
    ]);

    await withClient(async (client) => {
      const result = await call(client, 'get_context', {
        userId: 'u1',
        query: 'that bill',
      });

      const sc = result.structuredContent!;
      const matches = sc.matches as Array<{ contextId: string }>;
      expect(matches).toHaveLength(1);
      expect(matches[0].contextId).toBe('ctx-recent');
      expect(mockContexts.findRecentByType).toHaveBeenCalledWith(
        'u1',
        'bill',
        5,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────
// create_reminder / get_reminders
// ─────────────────────────────────────────────────────────────

describe('reminders', () => {
  it('create_reminder returns the new reminder id', async () => {
    mockReminders.createReminder.mockResolvedValueOnce({
      userId: 'u1',
      reminderId: 'rem-1',
      title: 'Pay electricity bill',
      scheduledAt: '2026-10-10T09:00:00+05:30',
      status: 'active',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'create_reminder', {
        userId: 'u1',
        title: 'Pay electricity bill',
        scheduledAt: '2026-10-10T09:00:00+05:30',
      });
      expect(result.structuredContent).toEqual({
        reminderId: 'rem-1',
        success: true,
      });
    });
  });

  it('get_reminders returns active reminders by default', async () => {
    mockReminders.getReminders.mockResolvedValueOnce([
      {
        userId: 'u1',
        reminderId: 'rem-1',
        title: 'Pay bill',
        scheduledAt: '2026-10-10T09:00:00+05:30',
        status: 'active',
        createdAt: '2026-09-27T07:00:00Z',
      },
    ]);

    await withClient(async (client) => {
      const result = await call(client, 'get_reminders', { userId: 'u1' });
      const sc = result.structuredContent!;
      expect((sc.reminders as unknown[]).length).toBe(1);
      expect(mockReminders.getReminders).toHaveBeenCalledWith('u1', 'active');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// draft_family_message — the drafting half of the safety gate
// ─────────────────────────────────────────────────────────────

describe('draft_family_message', () => {
  it('issues a confirmation token and does NOT send', async () => {
    mockDrafts.createDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'My bill is due.',
      status: 'draft',
      createdAt: '2026-09-27T07:00:00Z',
    });
    mockDrafts.attachConfirmationToken.mockResolvedValueOnce(undefined);

    await withClient(async (client) => {
      const result = await call(client, 'draft_family_message', {
        userId: 'u1',
        recipient: 'daughter',
        content: 'My bill is due.',
      });

      const sc = result.structuredContent!;
      expect(sc.draftId).toBe('d-1');
      expect(sc.requiresConfirmation).toBe(true);
      expect(typeof sc.confirmationToken).toBe('string');
      expect((sc.confirmationToken as string).length).toBeGreaterThan(0);

      // The critical assertion: drafting must not touch send.
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
      expect(mockDrafts.markConfirmed).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// send_family_message — the safety gate itself
// ─────────────────────────────────────────────────────────────

describe('send_family_message safety guards', () => {
  it('rejects when the draft does not exist', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce(null);

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-missing',
        confirmationToken: 'tok',
        userConfirmation: 'yes',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(false);
      expect(sc.rejectionReason).toMatch(/no draft found/i);
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
    });
  });

  it('rejects when the draft is already confirmed', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'X',
      status: 'confirmed',
      confirmationToken: 'tok',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-1',
        confirmationToken: 'tok',
        userConfirmation: 'yes',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(false);
      expect(sc.rejectionReason).toMatch(/status/i);
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
    });
  });

  it('rejects when the draft is already sent', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'X',
      status: 'sent',
      confirmationToken: 'tok',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-1',
        confirmationToken: 'tok',
        userConfirmation: 'yes',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(false);
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
    });
  });

  it('rejects when the confirmation token does not match', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'X',
      status: 'draft',
      confirmationToken: 'correct-token',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-1',
        confirmationToken: 'wrong-token',
        userConfirmation: 'yes',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(false);
      expect(sc.rejectionReason).toMatch(/confirmation token/i);
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
    });
  });

  it('rejects when userConfirmation is empty', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'X',
      status: 'draft',
      confirmationToken: 'tok',
      createdAt: '2026-09-27T07:00:00Z',
    });

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-1',
        confirmationToken: 'tok',
        userConfirmation: '',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(false);
      expect(sc.rejectionReason).toMatch(/no user confirmation/i);
      expect(mockDrafts.markSent).not.toHaveBeenCalled();
    });
  });

  it('sends when all four guards pass', async () => {
    mockDrafts.getDraft.mockResolvedValueOnce({
      userId: 'u1',
      draftId: 'd-1',
      recipient: 'daughter',
      content: 'X',
      status: 'draft',
      confirmationToken: 'correct-token',
      createdAt: '2026-09-27T07:00:00Z',
    });
    mockDrafts.markConfirmed.mockResolvedValueOnce(undefined);
    mockDrafts.markSent.mockResolvedValueOnce(undefined);

    await withClient(async (client) => {
      const result = await call(client, 'send_family_message', {
        userId: 'u1',
        draftId: 'd-1',
        confirmationToken: 'correct-token',
        userConfirmation: 'Yes.',
      });
      const sc = result.structuredContent!;
      expect(sc.sent).toBe(true);
      expect(sc.draftId).toBe('d-1');
      expect(mockDrafts.markConfirmed).toHaveBeenCalledWith('u1', 'd-1');
      expect(mockDrafts.markSent).toHaveBeenCalledWith('u1', 'd-1');
    });
  });
});