import type { AgentResponse } from '../types';

const ENDPOINT = '/api/chat';

export async function sendMessage(
  conversationId: string,
  message: string,
): Promise<AgentResponse> {
  let response: Response;

  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, message }),
    });
  } catch {
    throw new Error(
      'Could not reach the agent. Is it running on port 3000?',
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `The agent returned ${response.status}. ${detail || 'Try again in a moment.'}`,
    );
  }

  return (await response.json()) as AgentResponse;
}