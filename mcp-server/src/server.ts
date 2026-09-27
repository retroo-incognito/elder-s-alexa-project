import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { buildServer } from "./build-server.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "everyday-independence-agent-mcp",
    version: "1.0.0",
    transport: "streamable-http",
    timestamp: new Date().toISOString(),
  });
});

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] POST handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[mcp] GET handler error:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

app.delete("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[mcp] DELETE handler error:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

const port = config.MCP_SERVER_PORT;

app.listen(port, () => {
  console.log(
    `[mcp] Everyday Independence Agent MCP server listening on http://localhost:${port}`,
  );
  console.log(`[mcp] Endpoint: http://localhost:${port}/mcp`);
  console.log(`[mcp] Transport: Streamable HTTP (stateless)`);
  console.log(`[mcp] Health: http://localhost:${port}/health`);
});