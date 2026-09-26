import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { handleMessage } from './agent/orchestrator.js';
import { logger } from './lib/logger.js';
import { disconnect } from './lib/mcp-client.js';
import type { AgentInput } from './models/schemas.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'everyday-independence-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/chat', async (req, res) => {
  const body = req.body as Partial<AgentInput>;

  if (!body.message || typeof body.message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const input: AgentInput = {
    userId: body.userId ?? config.AGENT_USER_ID,
    conversationId: body.conversationId ?? randomUUID(),
    message: body.message,
  };

  try {
    const output = await handleMessage(input);
    res.json(output);
  } catch (err) {
    logger.error('Agent handler failed', { error: (err as Error).message });
    res.status(500).json({
      error: 'The agent could not process that request.',
      conversationId: input.conversationId,
    });
  }
});

const server = app.listen(config.AGENT_HTTP_PORT, () => {
  logger.info(
    `Agent listening on http://localhost:${config.AGENT_HTTP_PORT}`,
  );
  logger.info(`MCP server: ${config.MCP_SERVER_URL}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  server.close();
  await disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));