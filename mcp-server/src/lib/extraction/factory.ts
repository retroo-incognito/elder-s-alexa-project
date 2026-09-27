import { config } from '../../config.js';
import { bedrockExtractor } from './bedrock.js';
import { openaiExtractor } from './openai.js';
import { extractElectricityBill } from './fallback.js';
import type {
  ExtractionProvider,
  ExtractionProviderName,
  ExtractedFacts,
} from './types.js';

const registry: Record<ExtractionProviderName, ExtractionProvider> = {
  bedrock: bedrockExtractor,
  openai: openaiExtractor,
};

export function getExtractor(
  name?: ExtractionProviderName,
): ExtractionProvider {
  const selected = name ?? config.ANALYZE_PROVIDER;
  const provider = registry[selected];
  if (!provider) {
    throw new Error(`Unknown extraction provider: ${selected}`);
  }
  return provider;
}

/**
 * Extract facts from a message. Tries the configured provider first;
 * falls back to the deterministic bill extractor only if the provider
 * throws. Returns null when neither path produces a result.
 */
export async function extractFacts(
  content: string,
): Promise<ExtractedFacts | null> {
  const provider = getExtractor();

  try {
    return await provider.extract(content);
  } catch (err) {
    console.error(
      `[extraction] ${provider.name} failed, falling back to regex:`,
      (err as Error).message,
    );
    return extractElectricityBill(content);
  }
}