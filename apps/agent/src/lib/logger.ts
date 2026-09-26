type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, data?: unknown): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope: 'agent',
    message,
    ...(data !== undefined ? { data } : {}),
  };
  const fn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

export const logger = {
  debug: (m: string, d?: unknown) => log('debug', m, d),
  info: (m: string, d?: unknown) => log('info', m, d),
  warn: (m: string, d?: unknown) => log('warn', m, d),
  error: (m: string, d?: unknown) => log('error', m, d),
};