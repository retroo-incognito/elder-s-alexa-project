import { config } from '../../config.js';
import { bedrockProvider } from './bedrock.js';
import { openaiProvider } from './openai.js';
import type { LlmProvider, ProviderName } from './types.js';

const registry: Record<ProviderName, LlmProvider> = {
  bedrock: bedrockProvider,
  openai: openaiProvider,
};

export function getProvider(name?: ProviderName): LlmProvider {
  const selected = name ?? (config.LLM_PROVIDER as ProviderName);
  const provider = registry[selected];
  if (!provider) throw new Error(`Unknown LLM provider: ${selected}`);

  if (selected === 'openai' && !config.OPENAI_API_KEY) {
    throw new Error(
      'LLM_PROVIDER=openai but OPENAI_API_KEY is empty. ' +
        'Check the .env file at the repo root.',
    );
  }

  return provider;
}

export function availableProviders(): ProviderName[] {
  const out: ProviderName[] = [];
  if (config.AWS_REGION) out.push('bedrock');
  if (config.OPENAI_API_KEY) out.push('openai');
  return out;
}