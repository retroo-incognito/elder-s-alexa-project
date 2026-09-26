import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../../config.js';
import type { ConverseParams, LlmProvider } from './types.js';

let cached: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (cached) return cached;
  cached = new BedrockRuntimeClient({
    region: config.AWS_REGION,
    maxAttempts: 5,
    retryMode: 'adaptive',
  });
  return cached;
}

export const bedrockProvider: LlmProvider = {
  name: 'bedrock',

  async converse(params: ConverseParams): Promise<string> {
    const response = await getClient().send(
      new ConverseCommand({
        modelId: params.model ?? config.BEDROCK_MODEL_ID,
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
  },

  async converseJson<T>(params: ConverseParams): Promise<T> {
    const raw = await this.converse(params);
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return JSON.parse(cleaned) as T;
  },
};