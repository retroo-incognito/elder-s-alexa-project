import { describe, it, expect } from 'vitest';
import {
  issueConfirmationToken,
  tokensMatch,
} from '../src/lib/confirmation.js';

describe('confirmation tokens', () => {
  it('issues unique tokens on each call', () => {
    const a = issueConfirmationToken();
    const b = issueConfirmationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('matches a token against itself', () => {
    const token = issueConfirmationToken();
    expect(tokensMatch(token, token)).toBe(true);
  });

  it('rejects two distinct tokens', () => {
    const a = issueConfirmationToken();
    const b = issueConfirmationToken();
    expect(tokensMatch(a, b)).toBe(false);
  });

  it('rejects when expected is undefined', () => {
    expect(tokensMatch(undefined, issueConfirmationToken())).toBe(false);
  });

  it('rejects when provided is undefined', () => {
    expect(tokensMatch(issueConfirmationToken(), undefined)).toBe(false);
  });

  it('rejects when both are undefined', () => {
    expect(tokensMatch(undefined, undefined)).toBe(false);
  });

  it('rejects when both are empty strings', () => {
    expect(tokensMatch('', '')).toBe(false);
  });

  it('rejects same-length tokens that differ by one character', () => {
    // Guards against a subtle bug where timingSafeEqual throws on length
    // mismatch and the caller swallows the throw as "no match". Here the
    // lengths are equal, so the throw would be a real failure.
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
    expect(tokensMatch(a, b)).toBe(false);
  });
});