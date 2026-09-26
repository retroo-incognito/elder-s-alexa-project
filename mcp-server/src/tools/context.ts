import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type * as z from 'zod/v4';
import {
  GetContextInput,
  GetContextOutput,
  SaveContextInput,
  SaveContextOutput,
} from '../schemas/tool-schemas.js';
import * as contexts from '../db/contexts.js';
import type { ContextType } from '../db/types.js';

const KNOWN_KEYS: Record<string, ContextType> = {
  electricity_bill: 'bill',
  phone_bill: 'bill',
  water_bill: 'bill',
};

export function registerContextTools(server: McpServer): void {
  server.registerTool(
    'get_context',
    {
      title: 'Get Context',
      description:
        'Retrieve previously saved context for a user. ' +
        'Use this when the user refers to something from a prior conversation, ' +
        'such as "that bill" or "the appointment I told you about". ' +
        'Prefer exact key lookup when the key is known; fall back to type-based search otherwise.',
      inputSchema: GetContextInput,
      outputSchema: GetContextOutput,
    },
    async ({ userId, query, type }) => {
      // 1. Try exact key match first (fast, precise).
      const normalizedKey = query.toLowerCase().trim().replace(/\s+/g, '_');
      const byKey = await contexts.getContextByKey(userId, normalizedKey);
      if (byKey) {
        const result = {
          matches: [
            {
              contextId: byKey.contextId,
              type: byKey.type,
              key: byKey.key,
              data: byKey.data,
              createdAt: byKey.createdAt,
            },
          ],
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      // 2. Fuzzy fallback: resolve type from the query or use the hint.
      const resolvedType: ContextType =
        type ??
        KNOWN_KEYS[normalizedKey] ??
        (query.toLowerCase().includes('bill') ? 'bill' : 'general');

      const recent = await contexts.findRecentByType(userId, resolvedType, 5);
      const result = {
        matches: recent.map((r) => ({
          contextId: r.contextId,
          type: r.type,
          key: r.key,
          data: r.data,
          createdAt: r.createdAt,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    'save_context',
    {
      title: 'Save Context',
      description:
        'Persist a fact the user has authorized you to remember. ' +
        'Use this after extracting structured information the user will want to refer to later. ' +
        'Do not store sensitive data the user has not explicitly approved.',
      inputSchema: SaveContextInput,
      outputSchema: SaveContextOutput,
    },
    async ({ userId, type, key, data, source, ttlDays }) => {
      const record = await contexts.saveContext({
        userId,
        type: type as ContextType,
        key,
        data,
        source,
        ttlDays,
      });
      const result = { contextId: record.contextId, saved: true };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}