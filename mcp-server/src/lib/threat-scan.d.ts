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
export declare function normalizeForMatching(text: string): string;
export declare function isTrustedSender(senderId?: string): boolean;
export interface ScanOptions {
    senderId?: string;
}
export declare function scanForThreats(content: string, options?: ScanOptions): ThreatScanResult;
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
export declare function sanitizeForForwarding(content: string): string;
//# sourceMappingURL=threat-scan.d.ts.map