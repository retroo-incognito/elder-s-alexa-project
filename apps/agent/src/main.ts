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
        contexts: Array<{
          contextId: string;
          type: string;
          key: string;
          data: Record<string, unknown>;
          createdAt: string;
        }>;
      }>("list_recent_contexts", { userId, limit: 20 }),
    ]);

    // ── Date helpers (local-time based) ──────────────────────
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    /**
     * Parses a date value in local time. Handles:
     *   - ISO date-only: "2026-10-04"  → local Oct 4
     *   - ISO datetime:  "2026-10-04T09:00:00Z"  → converted to local day
     *   - Natural:       "October 4" / "4 October"  → current year
     */
    function parseLocalDate(value: string): Date | null {
      const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
      if (iso) {
        return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      }

      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }

      const y = new Date().getFullYear();
      for (const attempt of [`${value} ${y}`, `${y} ${value}`]) {
        const parsed = new Date(attempt);
        if (!Number.isNaN(parsed.getTime())) {
          return new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate(),
          );
        }
      }
      return null;
    }

    function classifyDate(
      value: unknown,
    ): "today" | "tomorrow" | "later" | "past" | null {
      if (typeof value !== "string" || value.length === 0) return null;

      const day = parseLocalDate(value);
      if (!day) return null;

      const t = day.getTime();
      if (t < todayStart.getTime()) return "past";
      if (t === todayStart.getTime()) return "today";
      if (t === tomorrowStart.getTime()) return "tomorrow";
      return "later";
    }

    const items: string[] = [];

    // ── Reminders due today or tomorrow ──────────────────────
    for (const r of reminders.reminders) {
      const bucket = classifyDate(r.scheduledAt);
      if (bucket !== "today" && bucket !== "tomorrow") continue;
      items.push(
        bucket === "today"
          ? `A reminder today: ${r.title}`
          : `A reminder tomorrow: ${r.title}`,
      );
    }

    // ── Contexts due in next 48 hours ────────────────────────
    for (const c of contexts.contexts) {
      const data = c.data as Record<string, unknown>;

      const risk = data.__risk as { level?: string } | undefined;
      if (risk?.level === "high") continue;

      const dateField =
        (data.dueDate as string | undefined) ??
        (data.appointmentDate as string | undefined) ??
        (data.eventDate as string | undefined);

      if (!dateField) continue;

      const bucket = classifyDate(dateField);
      if (bucket !== "today" && bucket !== "tomorrow") continue;

      const label =
        c.type === "bill"
          ? `Your ${(data.provider as string) ?? "bill"} for ₹${data.amount}`
          : c.type === "appointment"
            ? `Your appointment with ${(data.doctorName as string) ?? "the doctor"}`
            : `Your ${c.type}`;

      items.push(
        bucket === "today"
          ? `${label} is due today`
          : `${label} is due tomorrow`,
      );
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
