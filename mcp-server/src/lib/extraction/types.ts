export interface ExtractedFacts {
  summary: string;
  facts: Array<{ label: string; value: string }>;
  entities: Array<{
    type: string;
    key: string;
    data: Record<string, unknown>;
  }>;
  questionsAnswerableFromSource: string[];
}

export type ExtractionProviderName = 'bedrock' | 'openai';

export interface ExtractionProvider {
  readonly name: ExtractionProviderName;
  extract(content: string): Promise<ExtractedFacts>;
}