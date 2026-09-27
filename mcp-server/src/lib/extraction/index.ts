export type {
  ExtractedFacts,
  ExtractionProvider,
  ExtractionProviderName,
} from './types.js';
export { getExtractor, extractFacts } from './factory.js';
export { extractElectricityBill } from './fallback.js';