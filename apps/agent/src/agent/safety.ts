export enum SafetyLevel {
  READ = 1,
  LOW_RISK = 2,
  EXTERNAL_COMMS = 3,
  IRREVERSIBLE = 4,
}

const TOOL_LEVELS: Record<string, SafetyLevel> = {
  analyze_message: SafetyLevel.READ,
  get_context: SafetyLevel.READ,
  get_reminders: SafetyLevel.READ,
  save_context: SafetyLevel.LOW_RISK,
  create_reminder: SafetyLevel.LOW_RISK,
  draft_family_message: SafetyLevel.LOW_RISK,
  send_family_message: SafetyLevel.EXTERNAL_COMMS,
};

export function getSafetyLevel(toolName: string): SafetyLevel {
  return TOOL_LEVELS[toolName] ?? SafetyLevel.IRREVERSIBLE;
}

export function requiresConfirmation(toolName: string): boolean {
  return getSafetyLevel(toolName) >= SafetyLevel.EXTERNAL_COMMS;
}

/**
 * Detects a yes/no response. Used only to route a pending confirmation —
 * never as the sole proof the user confirmed. The MCP server validates
 * the confirmation token independently.
 */
export function isAffirmative(message: string): boolean {
  const m = message.toLowerCase().trim();
  return /^(yes|yeah|yep|sure|ok|okay|go ahead|send it|please do|do it)\b/.test(m);
}

export function isNegative(message: string): boolean {
  const m = message.toLowerCase().trim();
  return /^(no|nope|don't|do not|cancel|stop|not now|never mind)\b/.test(m);
}