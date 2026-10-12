import { describe, it, expect } from 'vitest';
import { scanForThreats } from '../src/lib/threat-scan.js';

interface EvalCase {
  id: string;
  text: string;
  expected: 'low' | 'medium' | 'high';
  category: string;
}

const CASES: EvalCase[] = [
  // ── Legitimate — should be low ──────────────────────
  { id: 'legit-01', category: 'utility-bill',
    text: 'Electricity bill of ₹1,842. Payment due October 15.',
    expected: 'low' },
  { id: 'legit-02', category: 'appointment',
    text: 'Appointment confirmed with Dr. Meera on 12 November at 4:30 PM.',
    expected: 'low' },
  { id: 'legit-03', category: 'event',
    text: 'Join us for the Golden Jubilee Celebration on Sunday, Nov 15.',
    expected: 'low' },
  { id: 'legit-04', category: 'bank-statement',
    text: 'Your HDFC account statement for October is available in net banking.',
    expected: 'low' },
  { id: 'legit-05', category: 'delivery',
    text: 'Your Amazon order has been shipped. Track at amazon.in/orders.',
    expected: 'low' },
  { id: 'legit-06', category: 'school-circular',
    text: 'Annual day function on 20 December. Parents are requested to attend.',
    expected: 'low' },
  { id: 'legit-07', category: 'insurance-renewal',
    text: 'Your LIC policy renewal is due on 5 January. Premium: ₹12,500.',
    expected: 'low' },
  { id: 'legit-08', category: 'utility-short-link',
    text: 'Your Airtel bill of ₹699 is due. Pay via the Airtel Thanks app.',
    expected: 'low' },
  { id: 'legit-09', category: 'pharmacy',
    text: 'Your prescription is ready for pickup at Apollo Pharmacy.',
    expected: 'low' },
  { id: 'legit-10', category: 'appointment-reminder',
    text: 'Reminder: dental cleaning tomorrow at 3 PM.',
    expected: 'low' },

  // ── Ambiguous — should be medium ────────────────────
  { id: 'amb-01', category: 'single-urgency',
    text: 'Please respond immediately regarding your subscription.',
    expected: 'medium' },
  { id: 'amb-02', category: 'single-link',
    text: 'Click here to view your statement.',
    expected: 'medium' },
  { id: 'amb-03', category: 'final-notice',
    text: 'Final notice: your account balance is overdue.',
    expected: 'medium' },
  { id: 'amb-04', category: 'legal-threat-alone',
    text: 'This matter may result in legal action.',
    expected: 'medium' },
  { id: 'amb-05', category: 'single-short-link',
    text: 'Your parcel is at bit.ly/x9k2.',
    expected: 'medium' },

  // ── Clear scams — should be high ────────────────────
  { id: 'scam-01', category: 'classic-phishing',
    text: 'URGENT: Your bank account will be closed within 24 hours. Click here to verify your account: http://bit.ly/x9k2',
    expected: 'high' },
  { id: 'scam-02', category: 'gift-card',
    text: 'Pay immediately via gift card to avoid legal action.',
    expected: 'high' },
  { id: 'scam-03', category: 'wire-crypto',
    text: 'Send payment via Bitcoin or Western Union to claim your refund.',
    expected: 'high' },
  { id: 'scam-04', category: 'credential-harvest',
    text: 'Verify your identity by entering your OTP and password.',
    expected: 'high' },
  { id: 'scam-05', category: 'ip-url',
    text: 'Confirm your details at http://192.168.1.10/login',
    expected: 'high' },
  { id: 'scam-06', category: 'obfuscated-urgency',
    text: 'U.R.G.E.N.T: Your account requires immediate attention.',
    expected: 'high' },
  { id: 'scam-07', category: 'homoglyph',
    text: 'Enter your 0TP to verify your account immediately.',
    expected: 'high' },
  { id: 'scam-08', category: 'prize-scam',
    text: 'Congratulations! You have won ₹50,000. Click here to claim your prize.',
    expected: 'high' },
  { id: 'scam-09', category: 'threat-closure',
    text: 'Your account will be permanently suspended. Verify immediately at bit.ly/verify.',
    expected: 'high' },
  { id: 'scam-10', category: 'gift-card-urgent',
    text: 'FINAL WARNING: purchase iTunes cards and send codes to avoid police action.',
    expected: 'high' },
];

describe('threat scanner eval set', () => {
  it('meets target accuracy', () => {
    const results = CASES.map((c) => {
      const actual = scanForThreats(c.text).risk;
      return { ...c, actual, pass: actual === c.expected };
    });

    const passed = results.filter((r) => r.pass).length;
    const accuracy = (passed / CASES.length) * 100;

    // Print for the Devpost screenshot
    console.log(`\nThreat scanner accuracy: ${passed}/${CASES.length} (${accuracy.toFixed(1)}%)\n`);

    const failures = results.filter((r) => !r.pass);
    if (failures.length > 0) {
      console.log('Failures:');
      for (const f of failures) {
        console.log(`  [${f.id}] ${f.category}: expected ${f.expected}, got ${f.actual}`);
        console.log(`    "${f.text.slice(0, 80)}..."`);
      }
    }

    // Target: 90% or better
    expect(accuracy).toBeGreaterThanOrEqual(90);
  });
});