import { z } from 'zod';

const EnvSchema = z.object({
  AWS_REGION: z.string().default('us-east-1'),

  DYNAMODB_USERS_TABLE: z.string().default('independence-users'),
  DYNAMODB_CONTEXT_TABLE: z.string().default('independence-context'),
  DYNAMODB_REMINDERS_TABLE: z.string().default('independence-reminders'),
  DYNAMODB_DRAFTS_TABLE: z.string().default('independence-message-drafts'),
  DYNAMODB_CONVERSATIONS_TABLE: z.string().default('independence-conversations'),

  MCP_SERVER_PORT: z.coerce.number().default(3001),
  MCP_SERVER_BASE_URL: z.string().default('http://localhost:3001'),

  BEDROCK_MODEL_ID: z
    .string()
    .default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;