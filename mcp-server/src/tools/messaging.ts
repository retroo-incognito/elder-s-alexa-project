import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DraftFamilyMessageInput,
  DraftFamilyMessageOutput,
  SendFamilyMessageInput,
  SendFamilyMessageOutput,
} from '../schemas/tool-schemas.js';
import * as drafts from '../db/drafts.js';
import * as contacts from '../db/contacts.js';
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
        'Prepare a message to a specific contact. This tool does NOT send anything. ' +
        'You must first call resolve_contact to get a valid contactId. ' +
        'Returns a draftId and a confirmationToken. Show the draft to the user ' +
        'and wait for explicit confirmation before calling send_family_message.',
      inputSchema: DraftFamilyMessageInput,
      outputSchema: DraftFamilyMessageOutput,
    },
    async ({ userId, contactId, content, relatedContextId }) => {
      const contact = await contacts.getContact(userId, contactId);
      if (!contact) {
        throw new Error(
          `Contact ${contactId} not found for user ${userId}. ` +
            `Call resolve_contact first.`,
        );
      }

      const token = issueConfirmationToken();
      const record = await drafts.createDraft({
        userId,
        recipient: contact.displayName,
        content,
        relatedContextId,
      });

      await drafts.attachConfirmationToken(userId, record.draftId, token);

      const result = {
        draftId: record.draftId,
        recipient: {
          contactId: contact.contactId,
          relationship: contact.relationship,
          displayName: contact.displayName,
          channel: contact.channel,
          address: contact.address,
        },
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
        'Send a previously drafted message. REJECTS unless all guards pass: ' +
        '(1) draftId exists, (2) draft status is still "draft", ' +
        '(3) confirmationToken matches, (4) userConfirmation is non-empty. ' +
        'Never call without having shown the draft to the user and received their yes.',
      inputSchema: SendFamilyMessageInput,
      outputSchema: SendFamilyMessageOutput,
    },
    async ({ userId, draftId, confirmationToken, userConfirmation }) => {
      const draft = await drafts.getDraft(userId, draftId);

      if (!draft) {
        return reject(draftId, 'No draft found for this user and draftId.');
      }
      if (draft.status !== 'draft') {
        return reject(
          draftId,
          `Draft is in status "${draft.status}" — cannot send.`,
        );
      }
      if (!tokensMatch(draft.confirmationToken, confirmationToken)) {
        return reject(
          draftId,
          'Confirmation token does not match the token issued for this draft.',
        );
      }
      if (!userConfirmation || userConfirmation.trim().length === 0) {
        return reject(draftId, 'No user confirmation provided.');
      }

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

function reject(draftId: string, reason: string) {
  const result = { sent: false, draftId, rejectionReason: reason };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
  };
}