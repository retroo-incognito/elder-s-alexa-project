import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk from mcp-server/src/ up to the repo root, then load .env.
loadEnv({ path: resolve(__dirname, "../../.env") });

const EnvSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),

  DYNAMODB_USERS_TABLE: z.string().default("independence-users"),
  DYNAMODB_CONTEXT_TABLE: z.string().default("independence-context"),
  DYNAMODB_REMINDERS_TABLE: z.string().default("independence-reminders"),
  DYNAMODB_DRAFTS_TABLE: z.string().default("independence-message-drafts"),
  DYNAMODB_CONVERSATIONS_TABLE: z
    .string()
    .default("independence-conversations"),
  DYNAMODB_CONTACTS_TABLE: z.string().default("independence-contacts"),

  MCP_SERVER_PORT: z.coerce.number().default(3001),
  MCP_SERVER_BASE_URL: z.string().default("http://localhost:3001"),

  // Extraction provider (analyze_message)
  ANALYZE_PROVIDER: z.enum(["bedrock", "openai"]).default("openai"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EXTRACTION_MODEL: z.string().default("gpt-4.1"),

  // Bedrock (only used when ANALYZE_PROVIDER=bedrock)
  BEDROCK_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-6"),
  REMINDER_HANDLER_ARN: z.string().optional(),
  SCHEDULER_ROLE_ARN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
