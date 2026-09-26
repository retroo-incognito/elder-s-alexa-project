import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DraftFamilyMessageInput,
  DraftFamilyMessageOutput,
  SendFamilyMessageInput,
  SendFamilyMessageOutput,
} from '../schemas/tool-schemas.js';
import * as drafts from '../db/drafts.js';
import {
  issueConfirmationToken,
  tokensMatch,
} from '../lib/confirmation.js';

export function registerMessagingTools(server: McpServer): void {
  server.registerTool(
    'draft_family_message',
    {
      title: 'Draft Family Message',
      description:
        'Prepare a message to a family member. This tool does NOT send anything. ' +
        'It returns a draftId and a confirmationToken. ' +
        'You must show the draft to the user and wait for explicit confirmation ' +
        'before calling send_family_message with the same draftId and token.',
      inputSchema: DraftFamilyMessageInput,
      outputSchema: DraftFamilyMessageOutput,
    },
    async ({ userId, recipient, content, relatedContextId }) => {
      const token = issueConfirmationToken();
      const record = await drafts.createDraft({
        userId,
        recipient,
        content,
        relatedContextId,
      });

      // Persist the token on the draft so send can validate it later.
      await drafts.attachConfirmationToken(userId, record.draftId, token);

      const result = {
        draftId: record.draftId,
        recipient,
        message: content,
        requiresConfirmation: true as const,
        confirmationToken: token,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    'send_family_message',
    {
      title: 'Send Family Message',
      description:
        'Send a previously drafted message. ' +
        'This tool will REJECT the call unless: ' +
        '(1) the draftId exists and is still in "draft" status, ' +
        '(2) the confirmationToken matches the one issued when the draft was created, and ' +
        '(3) userConfirmation contains the user actual confirmation words. ' +
        'Never call this without having shown the draft to the user and received their explicit yes.',
      inputSchema: SendFamilyMessageInput,
      outputSchema: SendFamilyMessageOutput,
    },
    async ({ userId, draftId, confirmationToken, userConfirmation }) => {
      const draft = await drafts.getDraft(userId, draftId);

      // ── Guard 1: draft must exist ──────────────────────────
      if (!draft) {
        const rejected = {
          sent: false,
          draftId,
          rejectionReason: 'No draft found for this user and draftId.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(rejected) }],
          structuredContent: rejected,
        };
      }

      // ── Guard 2: draft must still be in "draft" status ─────
      if (draft.status !== 'draft') {
        const rejected = {
          sent: false,
          draftId,
          rejectionReason: `Draft is in status "${draft.status}" — cannot send.`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(rejected) }],
          structuredContent: rejected,
        };
      }

      // ── Guard 3: confirmation token must match ─────────────
      if (!tokensMatch(draft.confirmationToken, confirmationToken)) {
        const rejected = {
          sent: false,
          draftId,
          rejectionReason:
            'Confirmation token does not match the token issued for this draft.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(rejected) }],
          structuredContent: rejected,
        };
      }

      // ── Guard 4: user confirmation must be non-empty ───────
      if (!userConfirmation || userConfirmation.trim().length === 0) {
        const rejected = {
          sent: false,
          draftId,
          rejectionReason: 'No user confirmation provided.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(rejected) }],
          structuredContent: rejected,
        };
      }

      // ── All guards passed: advance the lifecycle atomically ─
      await drafts.markConfirmed(userId, draftId);
      await drafts.markSent(userId, draftId);

      const result = {
        sent: true,
        draftId,
        sentAt: new Date().toISOString(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}