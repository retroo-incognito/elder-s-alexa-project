import {
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { ddb } from './client.js';
import { config } from '../config.js';
import type { ContactRecord, UserId } from './types.js';

const TABLE = config.DYNAMODB_CONTACTS_TABLE;

export interface SaveContactInput {
  userId: UserId;
  relationship: string;
  displayName: string;
  channel: string;
  address: string;
}

export async function saveContact(
  input: SaveContactInput,
): Promise<ContactRecord> {
  const record: ContactRecord = {
    userId: input.userId,
    contactId: randomUUID(),
    relationship: input.relationship.toLowerCase().trim(),
    displayName: input.displayName,
    channel: input.channel,
    address: input.address,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

export async function getContact(
  userId: UserId,
  contactId: string,
): Promise<ContactRecord | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { userId, contactId } }),
  );
  return (result.Item as ContactRecord) ?? null;
}

/** Exact match on the relationship word, using the RelationshipIndex GSI. */
export async function findByRelationship(
  userId: UserId,
  relationship: string,
): Promise<ContactRecord | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'RelationshipIndex',
      KeyConditionExpression: 'userId = :u AND relationship = :r',
      ExpressionAttributeValues: {
        ':u': userId,
        ':r': relationship.toLowerCase().trim(),
      },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as ContactRecord) ?? null;
}

/** Case-insensitive prefix match on the display name. Used for "Priya". */
export async function findByDisplayName(
  userId: UserId,
  name: string,
): Promise<ContactRecord[]> {
  const all = await listContacts(userId);
  const needle = name.toLowerCase().trim();
  return all.filter(
    (c) =>
      c.displayName.toLowerCase().startsWith(needle) ||
      c.displayName.toLowerCase().includes(needle),
  );
}

export async function listContacts(
  userId: UserId,
): Promise<ContactRecord[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }),
  );
  return (result.Items ?? []) as ContactRecord[];
}

export async function deleteContact(
  userId: UserId,
  contactId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { userId, contactId } }),
  );
}