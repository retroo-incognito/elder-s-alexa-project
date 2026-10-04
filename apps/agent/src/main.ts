import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { handleMessage } from "./agent/orchestrator.js";
import { logger } from "./lib/logger.js";
import { callTool, disconnect } from "./lib/mcp-client.js";
import type { AgentInput } from "./models/schemas.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "everyday-independence-agent",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as Partial<AgentInput>;

  if (!body.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message is required" });
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
    logger.error("Agent handler failed", { error: (err as Error).message });
    res.status(500).json({
      error: "The agent could not process that request.",
      conversationId: input.conversationId,
    });
  }
});

app.post("/api/proactive/morning", async (req, res) => {
  const userId = (req.body?.userId as string) ?? config.AGENT_USER_ID;

  try {
    const [reminders, contexts] = await Promise.all([
      callTool<{
        reminders: Array<{
          reminderId: string;
          title: string;
          scheduledAt: string;
          status: string;
        }>;
      }>("get_reminders", { userId, status: "active" }),
      callTool<{
        matches: Array<{
          contextId: string;
          type: string;
          key: string;
          data: Record<string, unknown>;
          createdAt: string;
        }>;
      }>("get_context", { userId, query: "recent" }),
    ]);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const items: string[] = [];

    // Reminders due today
    for (const r of reminders.reminders) {
      const d = new Date(r.scheduledAt).toISOString().slice(0, 10);
      if (d === todayStr) {
        items.push(`A reminder: ${r.title}`);
      }
    }

    // Contexts with deadlines in next 48 hours
    for (const c of contexts.matches) {
      const data = c.data as Record<string, unknown>;

      // Skip flagged messages
      const risk = data.__risk as { level?: string } | undefined;
      if (risk?.level === "high") continue;

      const dateField =
        (data.dueDate as string | undefined) ??
        (data.appointmentDate as string | undefined) ??
        (data.eventDate as string | undefined);

      if (!dateField) continue;

      const dateStr = String(dateField).slice(0, 10);
      const label =
        c.type === "bill"
          ? `Your ${(data.provider as string) ?? "bill"} for ₹${data.amount}`
          : c.type === "appointment"
            ? `Your appointment with ${(data.doctorName as string) ?? "the doctor"}`
            : `Your ${c.type}`;

      if (dateStr === todayStr) {
        items.push(`${label} is today`);
      } else if (dateStr === tomorrowStr) {
        items.push(`${label} is tomorrow`);
      }
    }

    if (items.length === 0) {
      res.json({ speak: false, reason: "Nothing to report" });
      return;
    }

    const greeting = `Good morning. ${items.join(". ")}.`;

    res.json({
      speak: true,
      greeting,
      itemCount: items.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Morning briefing failed", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Could not generate briefing" });
  }
});
const server = app.listen(config.AGENT_HTTP_PORT, () => {
  logger.info(`Agent listening on http://localhost:${config.AGENT_HTTP_PORT}`);
  logger.info(`MCP server: ${config.MCP_SERVER_URL}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  server.close();
  await disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
