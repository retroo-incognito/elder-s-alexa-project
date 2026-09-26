import OpenAI from 'openai';
import { config } from '../../config.js';
import type { ConverseParams, LlmProvider } from './types.js';

let cached: OpenAI | null = null;

function getClient(): OpenAI {
  if (cached) return cached;

  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to the repo-root .env file ' +
        'or set LLM_PROVIDER=bedrock to use Claude instead.',
    );
  }

  cached = new OpenAI({ apiKey });
  return cached;
}

export const openaiProvider: LlmProvider = {
  name: 'openai',

  async converse(params: ConverseParams): Promise<string> {
    const client = getClient();
    const response = await client.responses.create({
      model: params.model ?? config.OPENAI_MODEL,
      instructions: params.system,
      input: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_output_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.3,
    });

    const text = response.output_text;
    if (!text) throw new Error('OpenAI returned an empty response');
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