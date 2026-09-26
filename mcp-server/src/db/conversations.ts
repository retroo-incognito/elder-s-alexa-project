import {
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { ConversationRecord, UserId } from './types.js';

const TABLE = config.DYNAMODB_CONVERSATIONS_TABLE;
const MAX_RECENT_TURNS = 20;
const TTL_DAYS = 30;

export async function getConversation(
  userId: UserId,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { userId, conversationId } }),
  );
  return (result.Item as ConversationRecord) ?? null;
}

export async function createConversation(
  userId: UserId,
): Promise<ConversationRecord> {
  const now = new Date();
  const record: ConversationRecord = {
    userId,
    conversationId: randomUUID(),
    recentTurns: [],
    activeContextIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400,
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

export async function appendTurn(
  userId: UserId,
  conversationId: string,
  turn: ConversationRecord['recentTurns'][number],
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, conversationId },
      UpdateExpression:
        'SET recentTurns = list_append(if_not_exists(recentTurns, :empty), :turn), updatedAt = :now',
      ExpressionAttributeValues: {
        ':empty': [],
        ':turn': [turn],
        ':now': new Date().toISOString(),
      },
    }),
  );

  // Trim to MAX_RECENT_TURNS — separate write, cheap and keeps the
  // update above simple.
  const convo = await getConversation(userId, conversationId);
  if (convo && convo.recentTurns.length > MAX_RECENT_TURNS) {
    const trimmed = convo.recentTurns.slice(-MAX_RECENT_TURNS);
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...convo, recentTurns: trimmed },
      }),
    );
  }
}

export async function setActiveContexts(
  userId: UserId,
  conversationId: string,
  contextIds: string[],
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, conversationId },
      UpdateExpression: 'SET activeContextIds = :ids, updatedAt = :now',
      ExpressionAttributeValues: {
        ':ids': contextIds,
        ':now': new Date().toISOString(),
      },
    }),
  );
}