import { describe, it, expect } from 'vitest';
import { scanForThreats } from '../src/lib/threat-scan.js';

describe('scanForThreats', () => {
  it('flags a classic phishing pattern as high', () => {
    const result = scanForThreats(
      'URGENT: Your account will be closed. Click here to verify your account: http://bit.ly/x9k2',
    );
    expect(result.risk).toBe('high');
    expect(result.blockActions).toBe(true);
    expect(result.signals.map((s) => s.category)).toContain('account-threat');
    expect(result.signals.map((s) => s.category)).toContain('suspicious-link');
  });

  it('flags gift-card coercion as high', () => {
    const result = scanForThreats(
      'Pay immediately via gift card to avoid legal action.',
    );
    expect(result.risk).toBe('high');
  });

  it('flags an IP-address URL as high', () => {
    const result = scanForThreats(
      'Verify your details at http://192.168.1.10/login',
    );
    expect(result.risk).toBe('high');
  });

  it('returns low for a normal utility bill', () => {
    const result = scanForThreats(
      'Electricity bill of ₹1,842. Payment due September 28.',
    );
    expect(result.risk).toBe('low');
    expect(result.blockActions).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('returns low for a doctor appointment', () => {
    const result = scanForThreats(
      'Appointment confirmed with Dr. Meera on 12 November at 4:30 PM.',
    );
    expect(result.risk).toBe('low');
  });

  it('returns medium for a single urgency signal', () => {
    const result = scanForThreats(
      'Please respond immediately regarding your subscription.',
    );
    expect(result.risk).toBe('medium');
    expect(result.blockActions).toBe(false);
  });

  it('returns high for two medium signals combined', () => {
    const result = scanForThreats(
      'Final notice: click here to update your details.',
    );
    expect(result.risk).toBe('high');
  });

  it('does not block on "urgent" alone', () => {
    const result = scanForThreats('An urgent reminder about your parcel.');
    expect(result.blockActions).toBe(false);
  });
});