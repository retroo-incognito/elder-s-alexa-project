import {
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { ContextRecord, ContextType, UserId } from './types.js';

const TABLE = config.DYNAMODB_CONTEXT_TABLE;

export interface SaveContextInput {
  userId: UserId;
  type: ContextType;
  key: string;
  data: Record<string, unknown>;
  source: string;
  ttlDays?: number;
}

export async function saveContext(
  input: SaveContextInput,
): Promise<ContextRecord> {
  const now = new Date();
  const record: ContextRecord = {
    userId: input.userId,
    contextId: randomUUID(),
    type: input.type,
    key: input.key,
    data: input.data,
    source: input.source,
    createdAt: now.toISOString(),
    ...(input.ttlDays
      ? {
          expiresAt: Math.floor(now.getTime() / 1000) + input.ttlDays * 86400,
        }
      : {}),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

/**
 * Fetch by exact key for a user (e.g. "electricity_bill").
 * Uses the KeyIndex GSI — no table scan.
 */
export async function getContextByKey(
  userId: UserId,
  key: string,
): Promise<ContextRecord | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'KeyIndex',
      KeyConditionExpression: 'userId = :u AND #k = :k',
      ExpressionAttributeNames: { '#k': 'key' },
      ExpressionAttributeValues: { ':u': userId, ':k': key },
      Limit: 1,
      ScanIndexForward: false,
    }),
  );
  return (result.Items?.[0] as ContextRecord) ?? null;
}

export async function getContextById(
  userId: UserId,
  contextId: string,
): Promise<ContextRecord | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :u AND contextId = :c',
      ExpressionAttributeValues: { ':u': userId, ':c': contextId },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as ContextRecord) ?? null;
}

/**
 * Fuzzy-ish search: match by type (bill, appointment, …) and return
 * recent entries. This is what the agent calls when the user says
 * "that bill" without a known key.
 */
export async function findRecentByType(
  userId: UserId,
  type: ContextType,
  limit = 5,
): Promise<ContextRecord[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :u',
      FilterExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':u': userId, ':t': type },
      Limit: limit,
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []) as ContextRecord[];
}

export async function deleteContext(
  userId: UserId,
  contextId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { userId, contextId },
    }),
  );
}