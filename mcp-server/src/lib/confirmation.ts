import { randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Generates a one-time confirmation token bound to a draft.
 * The token is returned to the agent exactly once, when the draft
 * is created. It is never exposed again.
 */
export function issueConfirmationToken(): string {
  return randomUUID();
}

/**
 * Constant-time comparison to avoid timing side-channels.
 * Returns false if either value is missing.
 */
export function tokensMatch(
  expected: string | undefined,
  provided: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}