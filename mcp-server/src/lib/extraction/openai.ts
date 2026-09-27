import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { config } from '../../config.js';
import {
  ExtractionSchema,
  EXTRACTION_SYSTEM_PROMPT,
  normalizeExtraction,
  type RawExtraction,
} from './schema.js';
import type { ExtractionProvider } from './types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  return client;
}

export const openaiExtractor: ExtractionProvider = {
  name: 'openai',

  async extract(content: string) {
    const response = await getClient().chat.completions.parse({
      model: config.OPENAI_EXTRACTION_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: zodResponseFormat(
        ExtractionSchema,
        'message_analysis',
      ),
      // No temperature — GPT-5.x reasoning models reject it.
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error('OpenAI returned no parsed structured output');
    }

    return normalizeExtraction(parsed as RawExtraction);
  },
};