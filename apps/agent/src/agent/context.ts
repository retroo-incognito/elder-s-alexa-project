import { callTool } from "../lib/mcp-client.js";
import type { ContextMatch } from "../models/schemas.js";

interface GetContextResult {
  matches: ContextMatch[];
}

const VAGUE = new Set(["it", "that", "this", "that one", "the one", "them"]);

const GENERIC_RECIPIENTS = new Set([
  'relative', 'family', 'someone', 'anyone', 'person',
  'people', 'contact', 'friend', 'them',
]);

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
// export function extractRecipient(message: string): string | null {
//   const lower = message.toLowerCase();

//   // Possessive + relationship word
//   const possessive = lower.match(/\b(?:my|our)\s+([a-z]+)/g);
//   if (possessive) {
//     for (const match of possessive) {
//       const word = match.replace(/^(?:my|our)\s+/, '');
//       const rel = normalizeRelationship(word);
//       if (rel) {
//         // A known relationship word was found. If it's generic,
//         // signal that clarification is needed.
//         if (GENERIC_RECIPIENTS.has(rel)) return null;
//         return rel;
//       }
//     }
//   }

//   // Direct verb + name
//   const direct = lower.match(
//     /\b(?:tell|notify|inform|call)\s+(?:my\s+|our\s+)?([a-z]+)/i,
//   );
//   if (direct?.[1] && !STOP_WORDS.has(direct[1])) {
//     const rel = normalizeRelationship(direct[1]);
//     if (rel && GENERIC_RECIPIENTS.has(rel)) return null;
//     return direct[1];
//   }

//   // Indirect: send ... to <relationship>
//   const indirect = lower.match(
//     /\b(?:send|share|forward|give)\b[^.!?]*?\b(?:to|with)\s+(?:my\s+|our\s+)?([a-z]+)/i,
//   );
//   if (indirect?.[1]) {
//     const rel = normalizeRelationship(indirect[1]);
//     if (rel) {
//       if (GENERIC_RECIPIENTS.has(rel)) return null;
//       return rel;
//     }
//   }

//   return null;
// }

export function extractRecipient(message: string): string | null {
  const lower = message.toLowerCase();

  const possessive = lower.match(/\b(?:my|our)\s+([a-z]+)/g);
  if (possessive) {
    for (const match of possessive) {
      const word = match.replace(/^(?:my|our)\s+/, '');
      const rel = normalizeRelationship(word);
      if (rel) return rel;
    }
  }

  const direct = lower.match(
    /\b(?:tell|notify|inform|call)\s+(?:my\s+|our\s+)?([a-z]+)/i,
  );
  if (direct?.[1] && !STOP_WORDS.has(direct[1])) {
    return direct[1];
  }

  const indirect = lower.match(
    /\b(?:send|share|forward|give)\b[^.!?]*?\b(?:to|with)\s+(?:my\s+|our\s+)?([a-z]+)/i,
  );
  if (indirect?.[1]) return indirect[1];

  return null;
}
