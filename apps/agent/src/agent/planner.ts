import { converseJson } from '../lib/llm/index.js';
import { logger } from '../lib/logger.js';
import {
  PLANNER_SYSTEM_PROMPT,
} from './prompts.js';
import { isAffirmative, isNegative } from './safety.js';
import type { ConversationState, Plan } from '../models/schemas.js';

export async function plan(
  message: string,
  state: ConversationState,
): Promise<Plan> {
  // Deterministic short-circuit: if we are awaiting a confirmation and the
  // user says yes/no, do not consult the LLM. This makes the safety gate
  // independent of model behaviour.
  if (state.pendingConfirmation) {
    if (isAffirmative(message)) {
      return {
        intent: 'CONFIRM_SEND',
        reasoning: 'Pending confirmation and user replied affirmatively.',
        extractedReference: null,
      };
    }
    if (isNegative(message)) {
      return {
        intent: 'DENY_SEND',
        reasoning: 'Pending confirmation and user declined.',
        extractedReference: null,
      };
    }
  }

  const stateContext = state.activeContext
    ? JSON.stringify({
        type: state.activeContext.type,
        key: state.activeContext.key,
        data: state.activeContext.data,
      })
    : 'none';

  const pendingSummary = state.pendingConfirmation
    ? JSON.stringify({
        recipient: state.pendingConfirmation.recipient,
        message: state.pendingConfirmation.message,
      })
    : 'none';

  const recentTurns = state.recentTurns
    .slice(-4)
    .map((t) => `${t.role}: ${t.text}`)
    .join(' | ');

  const userContent = `
Current state:
- Active context: ${stateContext}
- Pending confirmation: ${pendingSummary}
- Recent turns: ${recentTurns || 'none'}

User message: "${message}"
`.trim();

  try {
    return await converseJson<Plan>({
      system: PLANNER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0,
      maxTokens: 256,
    });
  } catch (err) {
    logger.error('Planner failed, defaulting to UNKNOWN', {
      error: (err as Error).message,
    });
    return {
      intent: 'UNKNOWN',
      reasoning: 'Planner failure; safe fallback.',
      extractedReference: null,
    };
  }
}