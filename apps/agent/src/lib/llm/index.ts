export type { ConverseParams, LlmProvider, ProviderName } from './types.js';
export { getProvider, availableProviders } from './factory.js';

import { getProvider } from './factory.js';
import type { ConverseParams, ProviderName } from './types.js';

export interface CallOptions extends ConverseParams {
  /** Force a specific provider for this call. */
  provider?: ProviderName;
}

export async function converse(params: CallOptions): Promise<string> {
  const { provider, ...rest } = params;
  return getProvider(provider).converse(rest);
}

export async function converseJson<T>(params: CallOptions): Promise<T> {
  const { provider, ...rest } = params;
  return getProvider(provider).converseJson<T>(rest);
}