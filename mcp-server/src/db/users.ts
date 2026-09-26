import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { UserId, UserProfile } from './types.js';

const TABLE = config.DYNAMODB_USERS_TABLE;

export async function getUser(userId: UserId): Promise<UserProfile | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { userId } }),
  );
  return (result.Item as UserProfile) ?? null;
}

export async function upsertUser(profile: UserProfile): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: profile }));
}

/**
 * Idempotent default-user bootstrap for the demo.
 * Real deployments would create users via onboarding.
 */
export async function ensureUser(
  userId: UserId,
  displayName = 'Demo User',
  timezone = 'Asia/Kolkata',
): Promise<UserProfile> {
  const existing = await getUser(userId);
  if (existing) return existing;

  const created: UserProfile = {
    userId,
    displayName,
    timezone,
    preferences: {},
    createdAt: new Date().toISOString(),
  };
  await upsertUser(created);
  return created;
}