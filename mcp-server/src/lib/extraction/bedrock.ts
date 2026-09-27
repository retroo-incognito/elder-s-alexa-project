import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import * as z from 'zod/v4';
import { config } from '../../config.js';
import {
  ExtractionSchema,
  EXTRACTION_SYSTEM_PROMPT,
  normalizeExtraction,
  type RawExtraction,
} from './schema.js';
import type { ExtractionProvider } from './types.js';

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (client) return client;
  client = new BedrockRuntimeClient({ region: config.AWS_REGION });
  return client;
}

/**
 * Bedrock requires additionalProperties: false on every object node.
 * Zod's JSON Schema output omits it, so we add it recursively.
 */
function enforceAdditionalPropertiesFalse(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) enforceAdditionalPropertiesFalse(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === 'object' && !('additionalProperties' in obj)) {
    obj.additionalProperties = false;
  }
  for (const value of Object.values(obj)) {
    enforceAdditionalPropertiesFalse(value);
  }
}

/**
 * Strips keys Bedrock rejects or ignores. Our schema is fully inline
 * (no $ref, no $defs), so removing them is safe.
 */
function stripUnsupportedKeys(schema: Record<string, unknown>): void {
  delete schema.$schema;
  delete schema.$id;
  delete schema.$defs;
}

function buildBedrockSchema(): string {
  const schema = z.toJSONSchema(ExtractionSchema, {
    target: 'draft-7',
    io: 'output',
  }) as Record<string, unknown>;

  enforceAdditionalPropertiesFalse(schema);
  stripUnsupportedKeys(schema);

  return JSON.stringify(schema);
}

export const bedrockExtractor: ExtractionProvider = {
  name: 'bedrock',

  async extract(content: string) {
    const response = await getClient().send(
      new ConverseCommand({
        modelId: config.BEDROCK_MODEL_ID,
        system: [{ text: EXTRACTION_SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: content }] }],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0,
        },
        outputConfig: {
          textFormat: {
            type: 'json_schema',
            structure: {
              jsonSchema: {
                name: 'message_analysis',
                description:
                  'Structured extraction of a message the user received.',
                schema: buildBedrockSchema(),
              },
            },
          },
        },
      }),
    );

    const raw = response.output?.message?.content?.[0]?.text;
    if (!raw) {
      throw new Error('Bedrock returned no text content');
    }

    const parsed = JSON.parse(raw) as RawExtraction;
    return normalizeExtraction(parsed);
  },
};