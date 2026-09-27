import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type * as z from 'zod/v4';
import {
  AnalyzeMessageInput,
  AnalyzeMessageOutput,
} from '../schemas/tool-schemas.js';
import { extractFacts } from '../lib/extraction/index.js';

export function registerAnalyzeMessage(server: McpServer): void {
  server.registerTool(
    'analyze_message',
    {
      title: 'Analyze Message',
      description:
        'Analyze a supplied message or document and return structured facts. ' +
        'Use this when the user asks what a message means or wants information extracted. ' +
        'The returned questionsAnswerableFromSource field is an allow-list: do not answer ' +
        'questions outside it without saying the source does not cover them.',
      inputSchema: AnalyzeMessageInput,
      outputSchema: AnalyzeMessageOutput,
    },
    async ({
      content,
      source,
    }): Promise<{
      content: Array<{ type: 'text'; text: string }>;
      structuredContent: z.infer<typeof AnalyzeMessageOutput>;
    }> => {
      const extracted = await extractFacts(content);

      if (!extracted) {
        const empty: z.infer<typeof AnalyzeMessageOutput> = {
          summary: 'This message could not be parsed into structured facts.',
          facts: [],
          entities: [],
          questionsAnswerableFromSource: [],
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(empty) }],
          structuredContent: empty,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...extracted, source }),
          },
        ],
        structuredContent: extracted,
      };
    },
  );
}