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