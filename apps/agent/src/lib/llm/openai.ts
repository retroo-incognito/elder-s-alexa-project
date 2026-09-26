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

/**
 * GPT-5.x reasoning models reject `temperature` (and other sampling
 * params). Only forward it when the model is known to support it.
 *
 * Legacy chat models (gpt-4o, gpt-4.1, etc.) accept it.
 * Reasoning models (gpt-5*, o1*, o3*) do not.
 */
function modelSupportsTemperature(model: string): boolean {
  const reasoningPrefixes = ['gpt-5', 'o1', 'o3', 'o4'];
  return !reasoningPrefixes.some((p) => model.startsWith(p));
}

export const openaiProvider: LlmProvider = {
  name: 'openai',

  async converse(params: ConverseParams): Promise<string> {
    const client = getClient();
    const model = params.model ?? config.OPENAI_MODEL;

    const request: OpenAI.Responses.ResponseCreateParams = {
      model,
      instructions: params.system,
      input: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_output_tokens: params.maxTokens ?? 1024,
    };

    if (modelSupportsTemperature(model) && params.temperature !== undefined) {
      request.temperature = params.temperature;
    }

    const response = await client.responses.create(request);

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