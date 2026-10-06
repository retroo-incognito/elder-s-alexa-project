import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompleteReminderInput,
  CompleteReminderOutput,
  CreateReminderInput,
  CreateReminderOutput,
  FindFiredRemindersInput,
  FindFiredRemindersOutput,
  GetRemindersInput,
  GetRemindersOutput,
  ListMissedRemindersInput,
  ListMissedRemindersOutput,
  MarkReminderFiredInput,
  MarkReminderFiredOutput,
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

  server.registerTool(
  'mark_reminder_fired',
  {
    title: 'Mark Reminder Fired',
    description: 'Internal — called by the scheduler when a reminder is due.',
    inputSchema: MarkReminderFiredInput,
    outputSchema: MarkReminderFiredOutput,
  },
  async ({ userId, reminderId, firedAt }) => {
    try {
      await reminders.markReminderFired(userId, reminderId, firedAt);
    } catch {
      // Already fired — fine.
    }
    const result = { success: true };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  'complete_reminder',
  {
    title: 'Complete Reminder',
    description: 'Mark a reminder as completed after the user acknowledges it.',
    inputSchema: CompleteReminderInput,
    outputSchema: CompleteReminderOutput,
  },
  async ({ userId, reminderId }) => {
    await reminders.completeReminder(userId, reminderId);
    const result = { success: true };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  'find_fired_reminders',
  {
    title: 'Find Fired Reminders',
    description:
      'List reminders that have fired but not been acknowledged. Used by the notification feed.',
    inputSchema: FindFiredRemindersInput,
    outputSchema: FindFiredRemindersOutput,
  },
  async ({ userId }) => {
    const records = await reminders.findFiredReminders(userId);
    const result = {
      reminders: records.map((r) => ({
        reminderId: r.reminderId,
        title: r.title,
        scheduledAt: r.scheduledAt,
        firedAt: r.firedAt!,
        relatedContextId: r.relatedContextId,
      })),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);
}
