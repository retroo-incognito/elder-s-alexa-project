import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), 'infrastructure/scripts/../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { saveContact, listContacts } from '../../mcp-server/src/db/contacts.js';

const DEMO_USER_ID = process.env.AGENT_USER_ID ?? 'demo-user';

const SEED_CONTACTS = [
  {
    relationship: 'sister',
    displayName: 'Priya Sharma',
    channel: 'WhatsApp',
    address: '+91 98765 43210',
  },
  {
    relationship: 'daughter',
    displayName: 'Ananya Sharma',
    channel: 'SMS',
    address: '+91 98765 43211',
  },
  {
    relationship: 'son',
    displayName: 'Rohan Sharma',
    channel: 'Email',
    address: 'rohan.sharma@example.com',
  },
  {
    relationship: 'mother',
    displayName: 'Durga Sharma',
    channel: 'Email',
    address: 'durga.sharma@example.com',
  },
  {
    relationship: 'father',
    displayName: 'Rajesh Sharma',
    channel: 'Email',
    address: 'rajesh.sharma@example.com',
  },
];

async function main(): Promise<void> {
  const existing = await listContacts(DEMO_USER_ID);
  if (existing.length > 0) {
    console.log(
      `Already ${existing.length} contact(s) for ${DEMO_USER_ID}. ` +
        `Skipping seed to avoid duplicates.`,
    );
    return;
  }

  for (const c of SEED_CONTACTS) {
    const saved = await saveContact({ userId: DEMO_USER_ID, ...c });
    console.log(`✓ ${saved.relationship} → ${saved.displayName}`);
  }
  console.log(`\nSeeded ${SEED_CONTACTS.length} contacts for ${DEMO_USER_ID}.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});