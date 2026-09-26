import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { DraftStatus, MessageDraftRecord, UserId } from './types.js';

const TABLE = config.DYNAMODB_DRAFTS_TABLE;

export interface CreateDraftInput {
  userId: UserId;
  recipient: string;
  content: string;
  relatedContextId?: string;
}

export async function createDraft(
  input: CreateDraftInput,
): Promise<MessageDraftRecord> {
  const record: MessageDraftRecord = {
    userId: input.userId,
    draftId: randomUUID(),
    recipient: input.recipient,
    content: input.content,
    status: 'draft',
    ...(input.relatedContextId
      ? { relatedContextId: input.relatedContextId }
      : {}),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

export async function getDraft(
  userId: UserId,
  draftId: string,
): Promise<MessageDraftRecord | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { userId, draftId } }),
  );
  return (result.Item as MessageDraftRecord) ?? null;
}

/**
 * Atomic transition helper. The Conditions guarantee a draft can only
 * move forward through the lifecycle — never draft → sent directly,
 * never a second send of an already-sent draft.
 */
export async function markConfirmed(
  userId: UserId,
  draftId: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, draftId },
      UpdateExpression: 'SET #s = :next, confirmedAt = :now',
      ConditionExpression: '#s = :expected',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':next': 'confirmed' satisfies DraftStatus,
        ':expected': 'draft' satisfies DraftStatus,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

export async function markSent(
  userId: UserId,
  draftId: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, draftId },
      UpdateExpression: 'SET #s = :next, sentAt = :now',
      ConditionExpression: '#s = :expected',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':next': 'sent' satisfies DraftStatus,
        ':expected': 'confirmed' satisfies DraftStatus,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

export async function listRecentDrafts(
  userId: UserId,
  limit = 10,
): Promise<MessageDraftRecord[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
      Limit: limit,
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []) as MessageDraftRecord[];
}

export async function attachConfirmationToken(
  userId: UserId,
  draftId: string,
  token: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, draftId },
      UpdateExpression: 'SET confirmationToken = :t',
      ConditionExpression: '#s = :expected',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':t': token,
        ':expected': 'draft' satisfies DraftStatus,
      },
    }),
  );
}