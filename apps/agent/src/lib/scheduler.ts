import { callTool } from './mcp-client.js';
import { logger } from './logger.js';
import { config } from '../config.js';

interface ReminderRecord {
  userId: string;
  reminderId: string;
  title: string;
  scheduledAt: string;
  status: string;
  firedAt?: string;
}

const INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const result = await callTool<{ reminders: ReminderRecord[] }>(
      'get_reminders',
      { userId: config.AGENT_USER_ID, status: 'active' },
    );

    const now = Date.now();

    for (const r of result.reminders) {
      if (r.firedAt) continue;

      const dueAt = new Date(r.scheduledAt).getTime();
      if (Number.isNaN(dueAt) || dueAt > now) continue;

      await callTool('mark_reminder_fired', {
        userId: config.AGENT_USER_ID,
        reminderId: r.reminderId,
        firedAt: new Date().toISOString(),
      });

      logger.info('Reminder fired', {
        reminderId: r.reminderId,
        title: r.title,
      });
    }
  } catch (err) {
    logger.warn('Scheduler tick failed', {
      error: (err as Error).message,
    });
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref();
  logger.info(`Scheduler started (every ${INTERVAL_MS / 1000}s)`);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}