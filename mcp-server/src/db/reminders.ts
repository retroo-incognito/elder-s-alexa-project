import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { ReminderRecord, ReminderStatus, UserId } from './types.js';

const TABLE = config.DYNAMODB_REMINDERS_TABLE;

export interface CreateReminderInput {
  userId: UserId;
  title: string;
  scheduledAt: string;
  relatedContextId?: string;
}

export async function createReminder(
  input: CreateReminderInput,
): Promise<ReminderRecord> {
  const record: ReminderRecord = {
    userId: input.userId,
    reminderId: randomUUID(),
    title: input.title,
    scheduledAt: input.scheduledAt,
    status: 'active',
    ...(input.relatedContextId
      ? { relatedContextId: input.relatedContextId }
      : {}),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

export async function getReminders(
  userId: UserId,
  status: ReminderStatus = 'active',
): Promise<ReminderRecord[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'StatusIndex',
      KeyConditionExpression: 'userId = :u AND #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':u': userId, ':s': status },
    }),
  );
  return (result.Items ?? []) as ReminderRecord[];
}

export async function cancelReminder(
  userId: UserId,
  reminderId: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, reminderId },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'cancelled' },
    }),
  );
}

export async function createOrUpdateReminder(
  input: CreateReminderInput,
): Promise<ReminderRecord> {
  // If a pending reminder already exists for this context, update it.
  if (input.relatedContextId) {
    const existing = await findActiveByContext(
      input.userId,
      input.relatedContextId,
    );
    if (existing) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { userId: input.userId, reminderId: existing.reminderId },
          UpdateExpression:
            'SET title = :t, scheduledAt = :s',
          ExpressionAttributeValues: {
            ':t': input.title,
            ':s': input.scheduledAt,
          },
        }),
      );
      return {
        ...existing,
        title: input.title,
        scheduledAt: input.scheduledAt,
      };
    }
  }

  // Otherwise, create new.
  const record: ReminderRecord = {
    userId: input.userId,
    reminderId: randomUUID(),
    title: input.title,
    scheduledAt: input.scheduledAt,
    status: 'active',
    ...(input.relatedContextId
      ? { relatedContextId: input.relatedContextId }
      : {}),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

async function findActiveByContext(
  userId: UserId,
  relatedContextId: string,
): Promise<ReminderRecord | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'StatusIndex',
      KeyConditionExpression: 'userId = :u AND #s = :s',
      FilterExpression: 'relatedContextId = :c',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':u': userId,
        ':s': 'active',
        ':c': relatedContextId,
      },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as ReminderRecord) ?? null;
}

export async function findMissedReminders(
  userId: UserId,
): Promise<ReminderRecord[]> {
  const now = new Date().toISOString();

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'StatusIndex',
      KeyConditionExpression: 'userId = :u AND #s = :s',
      FilterExpression: 'scheduledAt < :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':u': userId,
        ':s': 'active',
        ':now': now,
      },
    }),
  );
  return (result.Items ?? []) as ReminderRecord[];
}