import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { config } from '../config.js';

const scheduler = new SchedulerClient({ region: config.AWS_REGION });

export interface ScheduleInput {
  reminderId: string;
  userId: string;
  title: string;
  scheduledAt: string; // ISO 8601
}

export async function createReminderSchedule(
  input: ScheduleInput,
): Promise<void> {
  const at = new Date(input.scheduledAt);

  // EventBridge Scheduler at() expressions use a specific format.
  const atExpression = `at(${at.toISOString().replace(/\.\d{3}Z$/, '')})`;

  await scheduler.send(
    new CreateScheduleCommand({
      Name: `reminder-${input.reminderId}`,
      ScheduleExpression: atExpression,
      ScheduleExpressionTimezone: 'UTC',
      FlexibleTimeWindow: { Mode: 'OFF' },
      ActionAfterCompletion: 'DELETE', // one-time schedules auto-delete
      Target: {
        Arn: config.REMINDER_HANDLER_ARN,
        RoleArn: config.SCHEDULER_ROLE_ARN,
        Input: JSON.stringify({
          userId: input.userId,
          reminderId: input.reminderId,
          title: input.title,
        }),
      },
    }),
  );
}

export async function cancelReminderSchedule(
  reminderId: string,
): Promise<void> {
  try {
    await scheduler.send(
      new DeleteScheduleCommand({ Name: `reminder-${reminderId}` }),
    );
  } catch {
    // Already deleted — fine.
  }
}