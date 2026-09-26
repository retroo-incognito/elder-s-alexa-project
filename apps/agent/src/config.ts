import { z } from 'zod';

const EnvSchema = z.object({
  AWS_REGION: z.string().default('us-east-1'),
  BEDROCK_MODEL_ID: z
    .string()
    .default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
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