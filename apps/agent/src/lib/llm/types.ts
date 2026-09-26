export interface ConverseParams {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Override the provider's default model for this call. */
  model?: string;
}

export type ProviderName = 'bedrock' | 'openai';

export interface LlmProvider {
  readonly name: ProviderName;
  converse(params: ConverseParams): Promise<string>;
  /** Structured output — returns a parsed object, not a string. */
  converseJson<T>(params: ConverseParams): Promise<T>;
}