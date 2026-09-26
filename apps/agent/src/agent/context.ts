import { callTool } from '../lib/mcp-client.js';
import type { ContextMatch } from '../models/schemas.js';

interface GetContextResult {
  matches: ContextMatch[];
}

const VAGUE = new Set(['it', 'that', 'this', 'that one', 'the one', 'them']);

function isVague(reference: string | null): boolean {
  if (!reference) return true;
  const r = reference.toLowerCase().trim();
  return VAGUE.has(r) || r.length < 4;
}

/**
 * Resolve a reference to a concrete saved context.
 *
 * Order of precedence:
 *   1. If the reference is vague and we already have an active context,
 *      keep the active context. This handles "tell my daughter about it".
 *   2. If the reference names a key we already hold, look it up exactly.
 *   3. Fuzzy search via get_context using the reference as the query.
 */
export async function resolveContext(
  userId: string,
  reference: string | null,
  activeContext: ContextMatch | null,
): Promise<ContextMatch | null> {
  if (isVague(reference) && activeContext) {
    return activeContext;
  }

  if (activeContext && reference) {
    const r = reference.toLowerCase();
    if (r.includes(activeContext.type) || r.includes(activeContext.key)) {
      return activeContext;
    }
  }

  const query = reference?.trim() || activeContext?.key || '';
  if (!query) return activeContext;

  const result = await callTool<GetContextResult>('get_context', {
    userId,
    query,
  });

  return result.matches[0] ?? activeContext ?? null;
}

/**
 * Extracts a recipient from a "tell X" or "message X" phrase.
 * Returns "daughter" from "tell my daughter about it".
 */
export function extractRecipient(message: string): string {
  const match = message.match(
    /\b(?:tell|message|text|notify|inform)\s+(?:my\s+|our\s+)?([a-zA-Z]+)/i,
  );
  return match?.[1]?.toLowerCase() ?? 'family';
}