import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as z from "zod/v4";
import {
  GetContextInput,
  GetContextOutput,
  SaveContextInput,
  SaveContextOutput,
} from "../schemas/tool-schemas.js";
import * as contexts from "../db/contexts.js";
import type { ContextType } from "../db/types.js";

const KNOWN_KEYS: Record<string, ContextType> = {
  electricity_bill: "bill",
  phone_bill: "bill",
  water_bill: "bill",
};

const HEURISTIC_TYPE_MAP: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /bill|payment|invoice/i, type: "bill" },
  { pattern: /appointment|doctor|clinic|dentist/i, type: "appointment" },
  { pattern: /event|party|invitation|wedding|birthday/i, type: "event" },
  { pattern: /notice|circular|announcement/i, type: "notice" },
  { pattern: /delivery|package|parcel|shipment/i, type: "delivery" },
  { pattern: /statement|balance|transaction/i, type: "statement" },
  { pattern: /subscription|renewal/i, type: "subscription" },
  { pattern: /insurance|policy|premium/i, type: "insurance" },
];

function inferType(query: string): string {
  for (const { pattern, type } of HEURISTIC_TYPE_MAP) {
    if (pattern.test(query)) return type;
  }
  return "general";
}

export function registerContextTools(server: McpServer): void {
  server.registerTool(
    "get_context",
    {
      title: "Get Context",
      description:
        "Retrieve previously saved context for a user. " +
        "Use this when the user refers to something from a prior conversation, " +
        'such as "that bill" or "the appointment I told you about". ' +
        "Prefer exact key lookup when the key is known; fall back to type-based search otherwise.",
      inputSchema: GetContextInput,
      outputSchema: GetContextOutput,
    },
    async ({ userId, query, type }) => {
      // 1. Try exact key match first (fast, precise).
      const normalizedKey = query.toLowerCase().trim().replace(/\s+/g, "_");
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
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      // 2. Fuzzy fallback: resolve type from the query or use the hint.
      const resolvedType: string =
        type ?? KNOWN_KEYS[normalizedKey] ?? inferType(query);

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
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "save_context",
    {
      title: "Save Context",
      description:
        "Persist a fact the user has authorized you to remember. " +
        "Use this after extracting structured information the user will want to refer to later. " +
        "Do not store sensitive data the user has not explicitly approved.",
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
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
