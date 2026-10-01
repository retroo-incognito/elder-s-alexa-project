import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ScanThreatInput,
  ScanThreatOutput,
} from '../schemas/tool-schemas.js';
import { scanForThreats } from '../lib/threat-scan.js';

export function registerThreatScanTool(server: McpServer): void {
  server.registerTool(
    'scan_threat',
    {
      title: 'Scan Threat',
      description:
        'Deterministic scan for scam and phishing signals. Handles common ' +
        'obfuscation (letter-spacing, homoglyphs, zero-width characters). ' +
        'When blockActions is true, do NOT call draft_family_message or ' +
        'send_family_message for this content. Instead, offer the user a ' +
        'sanitized summary they can forward to a trusted contact.',
      inputSchema: ScanThreatInput,
      outputSchema: ScanThreatOutput,
    },
    async ({ content, source, senderId }) => {
      const result = scanForThreats(content, { senderId });
      const payload = {
        risk: result.risk,
        signals: result.signals,
        reasoning: result.reasoning,
        blockActions: result.blockActions,
        allowListed: result.allowListed,
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...payload, source }),
          },
        ],
        structuredContent: payload,
      };
    },
  );
}