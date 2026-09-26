import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  AnalyzeMessageInput,
  AnalyzeMessageOutput,
} from "../schemas/tool-schemas.js";

interface ExtractedFacts {
  summary: string;
  facts: Array<{ label: string; value: string }>;
  entities: Array<{ type: string; key: string; data: Record<string, unknown> }>;
  questionsAnswerableFromSource: string[];
}

/**
 * Deterministic extractor for the demo electricity-bill scenario.
 *
 * Production path: replace this body with a Bedrock InvokeModel call
 * using a structured-output prompt. The return shape is identical, so
 * the rest of the system does not change.
 */
function extractElectricityBill(content: string): ExtractedFacts | null {
  const amountMatch = content.match(/₹\s*([\d,]+)/);
  const dueMatch = content.match(/due[:\s]+([A-Za-z]+\s+\d{1,2})/i);

  if (!amountMatch || !dueMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  const dueRaw = dueMatch[1].trim();

  // Normalize "September 28" → ISO date for the current year.
  const year = new Date().getUTCFullYear();
  const parsed = new Date(Date.UTC(year, 0, 1));
  const monthDayMatch = dueRaw.match(/^([A-Za-z]+)\s+(\d{1,2})$/);

  let dueDate: string | null = null;
  if (monthDayMatch) {
    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const monthIndex = monthNames.indexOf(monthDayMatch[1].toLowerCase());
    const day = Number(monthDayMatch[2]);
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      parsed.setUTCMonth(monthIndex, day);
      dueDate = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    summary: `Your electricity bill is ₹${amount.toLocaleString("en-IN")} and payment is due ${dueRaw}.`,
    facts: [
      { label: "Provider", value: "Electricity Company" },
      { label: "Amount", value: `₹${amount.toLocaleString("en-IN")}` },
      { label: "Due date", value: dueRaw },
    ],
    entities: [
      {
        type: "bill",
        key: "electricity_bill",
        data: {
          provider: "Electricity Company",
          amount,
          currency: "INR",
          dueDate,
        },
      },
    ],
    questionsAnswerableFromSource: [
      "What is the amount?",
      "When is it due?",
      "Who is the provider?",
    ],
  };
}

export function registerAnalyzeMessage(server: McpServer): void {
  server.registerTool(
    "analyze_message",
    {
      title: "Analyze Message",
      description:
        "Analyze a supplied message or document and return structured facts. " +
        "Use this when the user asks what a message means or wants information extracted. " +
        "The returned questionsAnswerableFromSource field is an allow-list: do not answer " +
        "questions outside it without saying the source does not cover them.",
      inputSchema: AnalyzeMessageInput,
      outputSchema: AnalyzeMessageOutput,
    },
    async ({
      content,
      source,
    }): Promise<{
      content: Array<{ type: "text"; text: string }>;
      structuredContent: z.infer<typeof AnalyzeMessageOutput>;
    }> => {
      const extracted = extractElectricityBill(content);

      if (!extracted) {
        const fallback: z.infer<typeof AnalyzeMessageOutput> = {
          summary: "This message could not be parsed into structured facts.",
          facts: [],
          entities: [],
          questionsAnswerableFromSource: [],
        };
        return {
          content: [{ type: "text", text: JSON.stringify(fallback) }],
          structuredContent: fallback,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...extracted, source }),
          },
        ],
        structuredContent: extracted,
      };
    },
  );
}
