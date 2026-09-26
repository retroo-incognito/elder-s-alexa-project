import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from apps/agent/src/ to the repo root, then load .env.
loadEnv({ path: resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  // ── Provider selection ──────────────────────────────────
  LLM_PROVIDER: z.enum(['bedrock', 'openai']).default('bedrock'),

  // ── Amazon Bedrock (Claude) ─────────────────────────────
  AWS_REGION: z.string().default('us-east-1'),
  BEDROCK_MODEL_ID: z
    .string()
    .default('us.anthropic.claude-sonnet-4-6'),

  // ── OpenAI ──────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.6-terra'),
  OPENAI_PLANNER_MODEL: z.string().default('gpt-5.6-luna'),

  // ── Agent ───────────────────────────────────────────────
  MCP_SERVER_URL: z.string().default('http://localhost:3001'),
  AGENT_HTTP_PORT: z.coerce.number().default(3000),
  AGENT_USER_ID: z.string().default('demo-user'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid agent environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;