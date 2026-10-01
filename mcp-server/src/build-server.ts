import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalyzeMessage } from './tools/analyze-message.js';
import { registerContextTools } from './tools/context.js';
import { registerReminderTools } from './tools/reminders.js';
import { registerMessagingTools } from './tools/messaging.js';
import { registerContactTools } from './tools/contacts.js';
import { registerThreatScanTool } from './tools/threat-scan.js';

/**
 * Build a fresh McpServer with all seven tools registered.
 * Exported separately from server.ts so tests can spin one up
 * without binding an HTTP port.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: 'everyday-independence-agent',
    version: '1.0.0',
  });

  registerAnalyzeMessage(server);
  registerContextTools(server);
  registerReminderTools(server);
  registerMessagingTools(server);
  registerContactTools(server);
  registerThreatScanTool(server);

  return server;
}