import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { registerAnalyzeMessage } from './tools/analyze-message.js';
import { registerContextTools } from './tools/context.js';
import { registerReminderTools } from './tools/reminders.js';
import { registerMessagingTools } from './tools/messaging.js';


interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionEntry>();
/**
 * Build a fresh McpServer with all seven tools registered.
 *
 * A new server is built per request in stateless mode, which keeps
 * tool handlers free of cross-request state and makes horizontal
 * scaling trivial.
 */
function buildServer(): McpServer {
  const server = new McpServer({
    name: 'everyday-independence-agent',
    version: '1.0.0',
  });

  registerAnalyzeMessage(server);
  registerContextTools(server);
  registerReminderTools(server);
  registerMessagingTools(server);

  return server;
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'everyday-independence-agent-mcp',
    version: '1.0.0',
    transport: 'streamable-http',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// POST /mcp — client-to-server messages
// ─────────────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let entry: SessionEntry | undefined;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // Fresh initialize — create a new server + transport pair.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { server, transport });
      },
    });

    const server = buildServer();

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    entry = { server, transport };
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message:
          'Bad Request: no valid session ID and body is not an initialize request.',
      },
      id: null,
    });
    return;
  }

  try {
    await entry.transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] POST handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────
// GET /mcp — server-to-client notifications (SSE stream)
// ─────────────────────────────────────────────────────────────
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing Mcp-Session-Id header');
    return;
  }

  const entry = sessions.get(sessionId)!;
  try {
    await entry.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[mcp] GET handler error:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /mcp — session termination
// ─────────────────────────────────────────────────────────────
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing Mcp-Session-Id header');
    return;
  }

  const entry = sessions.get(sessionId)!;
  try {
    await entry.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[mcp] DELETE handler error:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────
const port = config.MCP_SERVER_PORT;

app.listen(port, () => {
  console.log(
    `[mcp] Everyday Independence Agent MCP server listening on http://localhost:${port}`,
  );
  console.log(`[mcp] Endpoint: http://localhost:${port}/mcp`);
  console.log(`[mcp] Transport: Streamable HTTP (stateless)`);
  console.log(`[mcp] Health: http://localhost:${port}/health`);
});