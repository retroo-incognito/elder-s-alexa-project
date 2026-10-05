import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateReminderInput,
  CreateReminderOutput,
  GetRemindersInput,
  GetRemindersOutput,
  ListMissedRemindersInput,
  ListMissedRemindersOutput,
} from "../schemas/tool-schemas.js";
import * as reminders from "../db/reminders.js";
import type { ReminderStatus } from "../db/types.js";

export function registerReminderTools(server: McpServer): void {
  server.registerTool(
    "create_reminder",
    {
      title: "Create Reminder",
      description:
        "Schedule a reminder for the user. " +
        "Use this when the user asks to be reminded about a task or deadline. " +
        "The scheduledAt value must be an ISO 8601 datetime with timezone offset.",
      inputSchema: CreateReminderInput,
      outputSchema: CreateReminderOutput,
    },
    async ({ userId, title, scheduledAt, relatedContextId }) => {
      const record = await reminders.createReminder({
        userId,
        title,
        scheduledAt,
        relatedContextId,
      });
      const result = { reminderId: record.reminderId, success: true };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_reminders",
    {
      title: "Get Reminders",
      description:
        "List the user reminders filtered by status. " +
        "Use this when the user asks what reminders they have or what is coming up.",
      inputSchema: GetRemindersInput,
      outputSchema: GetRemindersOutput,
    },
    async ({ userId, status }) => {
      const records = await reminders.getReminders(
        userId,
        status as ReminderStatus,
      );
      const result = {
        reminders: records.map((r) => ({
          reminderId: r.reminderId,
          title: r.title,
          scheduledAt: r.scheduledAt,
          status: r.status,
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "list_missed_reminders",
    {
      title: "List Missed Reminders",
      description:
        "List reminders whose scheduled time has passed without being completed. " +
        'Use this when the user asks "what did I miss?" or "what did I forget?"',
      inputSchema: ListMissedRemindersInput,
      outputSchema: ListMissedRemindersOutput,
    },
    async ({ userId }) => {
      const records = await reminders.findMissedReminders(userId);
      const now = Date.now();
      const result = {
        missed: records.map((r) => ({
          reminderId: r.reminderId,
          title: r.title,
          scheduledAt: r.scheduledAt,
          daysOverdue: Math.floor(
            (now - new Date(r.scheduledAt).getTime()) / (1000 * 60 * 60 * 24),
          ),
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
