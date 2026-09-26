import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';

const client = new BedrockRuntimeClient({ region: config.AWS_REGION });

export interface ConverseParams {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export async function converse(params: ConverseParams): Promise<string> {
  const response = await client.send(
    new ConverseCommand({
      modelId: config.BEDROCK_MODEL_ID,
      system: [{ text: params.system }],
      messages: params.messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      inferenceConfig: {
        maxTokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 0.3,
      },
    }),
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) throw new Error('Bedrock returned an empty response');
  return text.trim();
}

export async function converseJson<T>(params: ConverseParams): Promise<T> {
  const raw = await converse(params);
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}