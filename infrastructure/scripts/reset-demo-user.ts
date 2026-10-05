import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const USER_ID = process.env.AGENT_USER_ID ?? 'demo-user';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
);

async function wipeTable(table: string, keyFields: string[]): Promise<number> {
  const scan = await client.send(new ScanCommand({ TableName: table }));
  const items = scan.Items ?? [];
  let removed = 0;

  for (const item of items) {
    if (item.userId !== USER_ID) continue;
    const key: Record<string, unknown> = {};
    for (const f of keyFields) key[f] = item[f];
    await client.send(new DeleteCommand({ TableName: table, Key: key }));
    removed++;
  }

  return removed;
}

async function main(): Promise<void> {
  console.log(`Clearing demo data for user "${USER_ID}"…\n`);

  const results = {
    contexts: await wipeTable('independence-context', ['userId', 'contextId']),
    reminders: await wipeTable('independence-reminders', ['userId', 'reminderId']),
    drafts: await wipeTable('independence-message-drafts', ['userId', 'draftId']),
    conversations: await wipeTable('independence-conversations', ['userId', 'conversationId']),
  };

  console.log('Removed:');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log('\nDone. Contacts were NOT touched.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});