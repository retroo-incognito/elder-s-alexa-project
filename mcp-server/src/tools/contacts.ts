import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ResolveContactInput,
  ResolveContactOutput,
} from '../schemas/tool-schemas.js';
import * as contacts from '../db/contacts.js';

function normalizeReference(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(?:my|our)\s+/, '')
    .replace(/^(?:the)\s+/, '')
    .trim();
}

export function registerContactTools(server: McpServer): void {
  server.registerTool(
    'resolve_contact',
    {
      title: 'Resolve Contact',
      description:
        'Look up a person in the user\'s contacts from a relationship word ' +
        '("my sister") or a name fragment ("Priya"). ' +
        'Call this BEFORE draft_family_message to get a real contactId. ' +
        'If found is false and suggestions is non-empty, ask the user which ' +
        'one they meant. If both are empty, tell them no such contact exists.',
      inputSchema: ResolveContactInput,
      outputSchema: ResolveContactOutput,
    },
    async ({ userId, reference }) => {
      const normalized = normalizeReference(reference);

      // 1. Exact relationship match ("sister").
      const byRelationship = await contacts.findByRelationship(
        userId,
        normalized,
      );
      if (byRelationship) {
        const result = {
          found: true,
          contact: {
            contactId: byRelationship.contactId,
            relationship: byRelationship.relationship,
            displayName: byRelationship.displayName,
            channel: byRelationship.channel,
            address: byRelationship.address,
          },
          suggestions: [],
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      // 2. Name match ("Priya").
      const byName = await contacts.findByDisplayName(userId, normalized);
      if (byName.length === 1) {
        const c = byName[0];
        const result = {
          found: true,
          contact: {
            contactId: c.contactId,
            relationship: c.relationship,
            displayName: c.displayName,
            channel: c.channel,
            address: c.address,
          },
          suggestions: [],
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      // 3. Ambiguous name — return all matches as suggestions.
      if (byName.length > 1) {
        const result = {
          found: false,
          suggestions: byName.map((c) => ({
            contactId: c.contactId,
            relationship: c.relationship,
            displayName: c.displayName,
            channel: c.channel,
          })),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      // 4. No match — return all contacts as fallback suggestions.
      //    This lets the agent say "I don't have a 'relative'. Your contacts
      //    are Priya, Ananya, and Rohan — did you mean one of them?"
      const all = await contacts.listContacts(userId);
      const result = {
        found: false,
        suggestions: all.map((c) => ({
          contactId: c.contactId,
          relationship: c.relationship,
          displayName: c.displayName,
          channel: c.channel,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}