export type RiskLevel = 'low' | 'medium' | 'high';
export type SignalSeverity = 'low' | 'medium' | 'high';
export type ScanTarget = 'raw' | 'normalized';

export interface ThreatSignal {
  category: string;
  severity: SignalSeverity;
  evidence: string;
  matchedAgainst: ScanTarget;
}

export interface ThreatScanResult {
  risk: RiskLevel;
  signals: ThreatSignal[];
  reasoning: string;
  blockActions: boolean;
  /** True if the sender allow-list downgraded the result. */
  allowListed: boolean;
}

// ─────────────────────────────────────────────────────────────
// Normalizer — defeats common text-obfuscation evasion
// ─────────────────────────────────────────────────────────────

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060\u180E]/g;

/**
 * Produces a "compressed" representation of the text where:
 *   - zero-width and formatting characters are removed
 *   - text is lowercased
 *   - common homoglyphs are canonicalised to letters
 *   - all non-letter characters are removed
 *
 * "U R G E N T"        → "urgent"
 * "b!tcoin"            → "bitcoin"
 * "0 T P"              → "otp"
 * "C.lick.here"        → "clickhere"
 * "http://x"           → "httpx"  (URLs are not scanned against this)
 *
 * This deliberately destroys spacing. Keyword patterns written
 * for the normalized pass must therefore be spaceless.
 */
export function normalizeForMatching(text: string): string {
  return text
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    // Homoglyphs → canonical letters. Applied before stripping.
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/\+/g, 't')
    // Keep only letters.
    .replace(/[^a-z]/g, '');
}

// ─────────────────────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────────────────────

interface Pattern {
  category: string;
  severity: SignalSeverity;
  target: ScanTarget;
  regex: RegExp;
  /**
   * Optional: a human-readable version of the phrase, used in the
   * evidence field when the match came from normalized text.
   */
  label?: string;
}

// High-severity patterns, all targeted at normalized text. The
// regexes are spaceless because normalizeForMatching strips all
// separators. This is what defeats "U.R.G.E.N.T" and "b!tcoin".
const HIGH_SEVERITY_PATTERNS: Pattern[] = [
  {
    category: 'payment-coercion',
    severity: 'high',
    target: 'normalized',
    regex:
      /(?:giftcards?|wiretransfer|westernunion|moneygram|bitcoin|cryptocurrency|itunescard|googleplaycard|prepaidcard|paywithcard)/,
    label: 'requests payment via gift card, wire, or crypto',
  },
  {
    category: 'credential-request',
    severity: 'high',
    target: 'normalized',
    regex:
      /(?:verifyyouraccount|verifyyouridentity|verifyyourdetails|verifyyourinformation|confiryouraccount|confiryourpassword|confiryourpin|confiryourssn|confiryouridentity|enteryour otp|enteryourotp|enteryourpin|enteryourpassword|enteryourssn|enteryoursocialsecurity|provideyourssn|provideyourpassword|provideyourpin)/,
    label: 'asks you to verify credentials or identity',
  },
  {
    category: 'account-threat',
    severity: 'high',
    target: 'normalized',
    regex:
      /(?:accountwillbeclosed|accountwillbesuspended|accountwillbelocked|accountwillbeterminated|permanentlysuspend|permanentlyclose|permanentlylock)/,
    label: 'threatens account closure or suspension',
  },
  {
    category: 'ip-url',
    severity: 'high',
    target: 'raw',
    regex: /\bhttps?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
    label: 'link points to a raw IP address',
  },
];

const MEDIUM_SEVERITY_PATTERNS: Pattern[] = [
  {
    category: 'urgency',
    severity: 'medium',
    target: 'normalized',
    regex:
      /(?:immediately|urgently|within\d+hours|within\d+minutes|actnow|finalnotice|finalwarning|lastchance|lastwarning|expirestoday|expires soon|expiresoon)/,
    label: 'uses urgency language',
  },
  {
    category: 'suspicious-link',
    severity: 'medium',
    target: 'raw',
    regex:
      /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|shorturl\.at|rb\.gy|cutt\.ly|shorte\.st)/i,
    label: 'uses a link shortener',
  },
  {
    category: 'click-prompt',
    severity: 'medium',
    target: 'normalized',
    regex:
      /(?:clickhere|clickthislink|clickthelink|followthislink|openthelink|taphere|tapthislink)/,
    label: 'tells you to click a link',
  },
  {
    category: 'legal-threat',
    severity: 'medium',
    target: 'normalized',
    regex:
      /(?:legalaction|lawsuit|courtproceedings?|arrested?|policeaction|policecase|firfiled|firwillbe)/,
    label: 'threatens legal or police action',
  },
  {
    category: 'prize-or-refund',
    severity: 'medium',
    target: 'normalized',
    regex:
      /(?:youhavewon|youwon|claimyourprize|claimyourrefund|congratulationsyou|selectedaswinner|selectedasawinner)/,
    label: 'claims you won a prize or refund',
  },
];

const ALL_PATTERNS: Pattern[] = [
  ...HIGH_SEVERITY_PATTERNS,
  ...MEDIUM_SEVERITY_PATTERNS,
];

// ─────────────────────────────────────────────────────────────
// Trusted sender allow-list
// ─────────────────────────────────────────────────────────────

/**
 * Known-good sender identifiers. Match is case-insensitive,
 * exact string. Add entries here as trusted institutions
 * are onboarded.
 */
const TRUSTED_SENDERS = new Set<string>([
  // Demo seeds
  'kai-clinic',
  'municipal-water-board',
  'electricity-company',
  'state-bank-of-india',
  'sbi',
  'hdfc-bank',
  'icici-bank',
  // Add more as needed
]);

export function isTrustedSender(senderId?: string): boolean {
  if (!senderId) return false;
  return TRUSTED_SENDERS.has(senderId.toLowerCase().trim());
}

// ─────────────────────────────────────────────────────────────
// Scanning
// ─────────────────────────────────────────────────────────────

function collectSignals(
  raw: string,
  normalized: string,
): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  for (const pattern of ALL_PATTERNS) {
    const haystack = pattern.target === 'raw' ? raw : normalized;
    const match = haystack.match(pattern.regex);
    if (match) {
      signals.push({
        category: pattern.category,
        severity: pattern.severity,
        evidence: pattern.label ?? match[0],
        matchedAgainst: pattern.target,
      });
    }
  }

  return signals;
}

function computeRisk(
  signals: ThreatSignal[],
  allowListed: boolean,
): RiskLevel {
  const highCount = signals.filter((s) => s.severity === 'high').length;
  const mediumCount = signals.filter((s) => s.severity === 'medium').length;

  let raw: RiskLevel = 'low';
  if (highCount >= 1) raw = 'high';
  else if (mediumCount >= 2) raw = 'high';
  else if (mediumCount === 1) raw = 'medium';

  if (!allowListed) return raw;

  // Trusted sender: downgrade one tier.
  if (raw === 'high') return 'medium';
  if (raw === 'medium') return 'low';
  return 'low';
}

function explain(
  risk: RiskLevel,
  signals: ThreatSignal[],
  allowListed: boolean,
): string {
  if (risk === 'low' && signals.length === 0) {
    return 'No suspicious patterns detected.';
  }

  const categories = Array.from(
    new Set(signals.map((s) => s.category)),
  ).join(', ');

  const allowNote = allowListed
    ? ' The sender is on the trusted list, so the risk has been reduced.'
    : '';

  if (risk === 'high') {
    return (
      `Multiple indicators of a scam or phishing attempt: ${categories}. ` +
      `The agent will not act on this message.`
    );
  }

  if (risk === 'medium') {
    return (
      `Some patterns commonly found in scam messages: ${categories}.` +
      allowNote +
      ` Proceed with caution.`
    );
  }

  return (
    `Minor signals detected: ${categories}.` + allowNote
  );
}

// ─────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────

export interface ScanOptions {
  senderId?: string;
}

export function scanForThreats(
  content: string,
  options: ScanOptions = {},
): ThreatScanResult {
  const raw = content;
  const normalized = normalizeForMatching(content);

  const signals = collectSignals(raw, normalized);
  const allowListed = isTrustedSender(options.senderId);
  const risk = computeRisk(signals, allowListed);

  return {
    risk,
    signals,
    reasoning: explain(risk, signals, allowListed),
    blockActions: risk === 'high',
    allowListed,
  };
}

// ─────────────────────────────────────────────────────────────
// Sanitizer — used by the quarantine escalation flow
// ─────────────────────────────────────────────────────────────

/**
 * Produces a safe version of a flagged message for forwarding:
 *   - strips all URLs
 *   - strips email addresses
 *   - strips phone numbers
 *   - collapses excessive whitespace
 *   - truncates to 280 characters
 *
 * The result should still convey "I got a message like this"
 * without carrying any clickable attack surface.
 */
export function sanitizeForForwarding(content: string): string {
  return content
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .replace(/\bwww\.\S+/gi, '[link removed]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]')
    .replace(/\+?\d[\d\s\-()]{7,}\d/g, '[number removed]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}