import { describe, it, expect } from 'vitest';
import {
  SafetyLevel,
  getSafetyLevel,
  requiresConfirmation,
  isAffirmative,
  isNegative,
} from '../src/agent/safety.js';

describe('isAffirmative', () => {
  const positives = [
    'yes',
    'Yes',
    'YES',
    'Yes.',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'go ahead',
    'send it',
    'please do',
    'do it',
  ];
  for (const p of positives) {
    it(`recognizes "${p}"`, () => expect(isAffirmative(p)).toBe(true));
  }

  it('rejects empty string', () => expect(isAffirmative('')).toBe(false));
  it('rejects unrelated content', () =>
    expect(isAffirmative('what is the weather')).toBe(false));
  it('rejects a sentence that merely contains "yes" later', () =>
    expect(isAffirmative('I think maybe yes but wait')).toBe(false));
});

describe('isNegative', () => {
  const negatives = [
    'no',
    'No.',
    'nope',
    "don't",
    'do not',
    'cancel',
    'stop',
    'not now',
    'never mind',
  ];
  for (const n of negatives) {
    it(`recognizes "${n}"`, () => expect(isNegative(n)).toBe(true));
  }
  it('rejects affirmative input', () => expect(isNegative('yes')).toBe(false));
});

describe('safety levels', () => {
  it('classifies read tools as READ', () => {
    expect(getSafetyLevel('analyze_message')).toBe(SafetyLevel.READ);
    expect(getSafetyLevel('get_context')).toBe(SafetyLevel.READ);
    expect(getSafetyLevel('get_reminders')).toBe(SafetyLevel.READ);
  });

  it('classifies low-risk actions as LOW_RISK', () => {
    expect(getSafetyLevel('save_context')).toBe(SafetyLevel.LOW_RISK);
    expect(getSafetyLevel('create_reminder')).toBe(SafetyLevel.LOW_RISK);
    expect(getSafetyLevel('draft_family_message')).toBe(SafetyLevel.LOW_RISK);
  });

  it('classifies external comms correctly', () => {
    expect(getSafetyLevel('send_family_message')).toBe(
      SafetyLevel.EXTERNAL_COMMS,
    );
  });

  it('defaults unknown tools to IRREVERSIBLE', () => {
    expect(getSafetyLevel('some_unknown_tool')).toBe(
      SafetyLevel.IRREVERSIBLE,
    );
  });

  it('requires confirmation only at EXTERNAL_COMMS and above', () => {
    expect(requiresConfirmation('analyze_message')).toBe(false);
    expect(requiresConfirmation('create_reminder')).toBe(false);
    expect(requiresConfirmation('draft_family_message')).toBe(false);
    expect(requiresConfirmation('send_family_message')).toBe(true);
    expect(requiresConfirmation('unknown_tool')).toBe(true);
  });
});