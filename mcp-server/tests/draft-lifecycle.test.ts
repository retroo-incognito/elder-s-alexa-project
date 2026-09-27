import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

vi.mock('../src/config.js', () => ({
  config: {
    AWS_REGION: 'us-east-1',
    DYNAMODB_USERS_TABLE: 'test-users',
    DYNAMODB_CONTEXT_TABLE: 'test-context',
    DYNAMODB_REMINDERS_TABLE: 'test-reminders',
    DYNAMODB_DRAFTS_TABLE: 'test-drafts',
    DYNAMODB_CONVERSATIONS_TABLE: 'test-conversations',
    MCP_SERVER_PORT: 3001,
    MCP_SERVER_BASE_URL: 'http://localhost:3001',
    BEDROCK_MODEL_ID: 'test-model',
  },
}));

import {
  createDraft,
  getDraft,
  markConfirmed,
  markSent,
  attachConfirmationToken,
} from '../src/db/drafts.js';

const conditionalFailure = () =>
  Object.assign(new Error('The conditional request failed'), {
    name: 'ConditionalCheckFailedException',
    $metadata: { httpStatusCode: 400 },
  });

beforeEach(() => {
  ddbMock.reset();
});

describe('draft lifecycle', () => {
  it('creates a draft in draft status', async () => {
    ddbMock.on(PutCommand).resolves({});
    const d = await createDraft({
      userId: 'u1',
      recipient: 'daughter',
      content: 'hello',
    });
    expect(d.status).toBe('draft');
    expect(d.draftId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('markConfirmed refuses when the draft is already confirmed', async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFailure());
    await expect(markConfirmed('u1', 'd1')).rejects.toThrow(
      /conditional request failed/i,
    );
  });

  it('markSent refuses when the draft is still in draft status', async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFailure());
    await expect(markSent('u1', 'd1')).rejects.toThrow(
      /conditional request failed/i,
    );
  });

  it('markSent refuses on a second send of an already-sent draft', async () => {
    // First call succeeds
    ddbMock.on(UpdateCommand).resolvesOnce({});
    await markSent('u1', 'd1');

    // Second call hits the condition and fails
    ddbMock.on(UpdateCommand).rejects(conditionalFailure());
    await expect(markSent('u1', 'd1')).rejects.toThrow(
      /conditional request failed/i,
    );
  });

  it('attachConfirmationToken refuses on a non-draft status', async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFailure());
    await expect(
      attachConfirmationToken('u1', 'd1', 'tok'),
    ).rejects.toThrow(/conditional request failed/i);
  });
});