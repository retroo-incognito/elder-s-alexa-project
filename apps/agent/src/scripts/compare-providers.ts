import { converse } from '../lib/llm/index.js';
import type { ProviderName } from '../lib/llm/types.js';

const PROMPT = `Electricity bill of ₹1,842. Payment due September 28.`;
const SYSTEM = `Explain this message in one short spoken sentence.`;

async function main(): Promise<void> {
  const providers: ProviderName[] = ['bedrock', 'openai'];

  for (const provider of providers) {
    try {
      const start = Date.now();
      const reply = await converse({
        system: SYSTEM,
        messages: [{ role: 'user', content: PROMPT }],
        provider,
        maxTokens: 128,
        temperature: 0.2,
      });
      const ms = Date.now() - start;
      console.log(`\n── ${provider} (${ms}ms) ──\n${reply}\n`);
    } catch (err) {
      console.error(`\n── ${provider} FAILED ──\n${(err as Error).message}\n`);
    }
  }
}

void main();