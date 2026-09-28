import { callTool } from "../lib/mcp-client.js";
import type { ContextMatch } from "../models/schemas.js";

interface GetContextResult {
  matches: ContextMatch[];
}

const VAGUE = new Set(["it", "that", "this", "that one", "the one", "them"]);

const RELATIONSHIP_WORDS = new Set([
  "mother",
  "mom",
  "mum",
  "mummy",
  "father",
  "dad",
  "daddy",
  "sister",
  "brother",
  "daughter",
  "son",
  "wife",
  "husband",
  "spouse",
  "aunt",
  "uncle",
  "cousin",
  "nephew",
  "niece",
  "grandmother",
  "grandfather",
  "grandma",
  "grandpa",
  "friend",
  "relative",
  "family",
  "partner",
  "neighbour",
  "neighbor",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "it",
  "one",
  "to",
  "with",
  "about",
  "for",
  "from",
  "of",
  "and",
  "or",
  "them",
  "him",
  "her",
  "message",
  "note",
  "text",
]);

function normalizeRelationship(word: string): string | null {
  if (RELATIONSHIP_WORDS.has(word)) return word;
  if (word.endsWith("s")) {
    const singular = word.slice(0, -1);
    if (RELATIONSHIP_WORDS.has(singular)) return singular;
  }
  return null;
}

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

  const query = reference?.trim() || activeContext?.key || "";
  if (!query) return activeContext;

  const result = await callTool<GetContextResult>("get_context", {
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
  const lower = message.toLowerCase();

  // Pattern 1: possessive + known relationship word anywhere in the
  // message. Catches "my daughter", "our son", "one of my relatives".
  // This must run first — it is the most reliable signal.
  const possessive = lower.match(/\b(?:my|our)\s+([a-z]+)/g);
  if (possessive) {
    for (const match of possessive) {
      const word = match.replace(/^(?:my|our)\s+/, "");
      const rel = normalizeRelationship(word);
      if (rel) return rel;
    }
  }

  // Pattern 2: direct verb + name. "tell Priya", "notify Ramesh".
  // Excludes ambiguous verbs ("message") that double as nouns.
  const direct = lower.match(
    /\b(?:tell|notify|inform|call)\s+(?:my\s+|our\s+)?([a-z]+)/i,
  );
  if (direct?.[1] && !STOP_WORDS.has(direct[1])) {
    return direct[1];
  }

  // Pattern 3: send/share/forward ... to/with <relationship>.
  // Only fires if the captured word is a known relationship,
  // which prevents "to one" and similar fragments.
  const indirect = lower.match(
    /\b(?:send|share|forward|give)\b[^.!?]*?\b(?:to|with)\s+(?:my\s+|our\s+)?([a-z]+)/i,
  );
  if (indirect?.[1]) {
    const rel = normalizeRelationship(indirect[1]);
    if (rel) return rel;
  }

  return "family";
}
