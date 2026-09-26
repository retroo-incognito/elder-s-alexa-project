import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config.js';
import { logger } from './logger.js';

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

async function connect(): Promise<Client> {
  const c = new Client({
    name: 'everyday-independence-agent',
    version: '1.0.0',
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(`${config.MCP_SERVER_URL}/mcp`),
  );

  await c.connect(transport);
  logger.info('Connected to MCP server', { url: config.MCP_SERVER_URL });
  return c;
}

async function getClient(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const c = await connect();
      client = c;
      return c;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

/**
 * Call an MCP tool and return its structuredContent.
 * Throws if the tool reports an error or returns no structured output.
 */
export async function callTool<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const c = await getClient();

  try {
    const result = await c.callTool({ name, arguments: args });

    if (result.isError) {
      throw new Error(
        `MCP tool "${name}" returned an error: ${JSON.stringify(result.content)}`,
      );
    }

    if (result.structuredContent === undefined) {
      throw new Error(
        `MCP tool "${name}" returned no structuredContent`,
      );
    }

    return result.structuredContent as T;
  } catch (err) {
    // One reconnect attempt if the connection dropped.
    logger.warn(`MCP call to "${name}" failed, reconnecting`, {
      error: (err as Error).message,
    });
    client = null;
    const fresh = await getClient();
    const retry = await fresh.callTool({ name, arguments: args });
    if (retry.isError || retry.structuredContent === undefined) {
      throw new Error(`MCP tool "${name}" failed after reconnect`);
    }
    return retry.structuredContent as T;
  }
}

export async function disconnect(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}