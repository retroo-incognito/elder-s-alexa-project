import { useEffect, useRef, useState } from "react";
import { sendMessage } from "./lib/agentClient";
import { Conversation } from "./components/Conversation";
import { ContextPanel } from "./components/ContextPanel";
import { ActionsPanel } from "./components/ActionsPanel";
import { ConfirmationPrompt } from "./components/ConfirmationPrompt";
import { VoiceInput } from "./components/VoiceInput";
import type {
  AgentAction,
  ContextMatch,
  PendingConfirmation,
  ProcessingPhase,
  Turn,
} from "./types";
import { playThinkingChime, speak, stopSpeaking } from "./lib/audio";
const MASK_THRESHOLD_MS = 600;
const SESSION_KEY = "independence-agent.conversationId";
const CHATS_KEY = "independence-agent.chats";
type Chat = { id: string; title: string; updatedAt: string; turns: Turn[] };
type View = "home" | "tasks" | "activity" | "tools" | "history";
const NAV: { id: View; label: string; index: string }[] = [
  { id: "home", label: "Home", index: "01" },
  { id: "tasks", label: "Tasks", index: "02" },
  { id: "activity", label: "Activity", index: "03" },
  { id: "tools", label: "Context", index: "04" },
  { id: "history", label: "History", index: "05" },
];

function newId(): string {
  return crypto.randomUUID();
}
function loadConversationId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const fresh = newId();
  sessionStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}
function loadChats(currentId: string): Chat[] {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CHATS_KEY) ?? "[]",
    ) as Chat[];
    if (Array.isArray(stored))
      return stored.some((chat) => chat.id === currentId)
        ? stored
        : [
            {
              id: currentId,
              title: "New conversation",
              updatedAt: new Date().toISOString(),
              turns: [],
            },
            ...stored,
          ];
  } catch {
    /* Start with a clean local history if storage is invalid. */
  }
  return [
    {
      id: currentId,
      title: "New conversation",
      updatedAt: new Date().toISOString(),
      turns: [],
    },
  ];
}

export default function App() {
  const [conversationId, setConversationId] = useState(loadConversationId);
  const [chats, setChats] = useState<Chat[]>(() =>
    loadChats(loadConversationId()),
  );
  const [turns, setTurns] = useState<Turn[]>(
    () => chats.find((chat) => chat.id === loadConversationId())?.turns ?? [],
  );
  const [context, setContext] = useState<ContextMatch | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ProcessingPhase>("idle");
  const maskingTimerRef = useRef<number | null>(null);
  const [view, setView] = useState<View>("home");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnsRef = useRef(turns);

  useEffect(() => {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }, [chats]);

  function saveTurn(chatId: string, turn: Turn, firstMessage = false): void {
    const next = [...turnsRef.current, turn];
    turnsRef.current = next;
    setTurns(next);
    setChats((existing) => {
      const chat = existing.find((item) => item.id === chatId);
      const title =
        firstMessage && chat?.title === "New conversation"
          ? turn.text.slice(0, 42)
          : (chat?.title ?? "New conversation");
      const updated = { id: chatId, title, updatedAt: turn.at, turns: next };
      return [updated, ...existing.filter((item) => item.id !== chatId)];
    });
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput("");
    setPhase("submitted");
    setView("tasks");

    // Schedule the latency mask. Cancelled the moment the response lands.
    maskingTimerRef.current = window.setTimeout(() => {
      setPhase("masking");
      playThinkingChime();
      // 150ms after the chime starts, speak. Overlapping the two feels
      // natural — chime is the "I heard you," speech is the "working on it."
      window.setTimeout(() => {
        speak("One moment.");
      }, 150);
    }, MASK_THRESHOLD_MS);

    const userTurn: Turn = {
      id: newId(),
      role: "user",
      text: trimmed,
      at: new Date().toISOString(),
    };
    saveTurn(conversationId, userTurn, true);
    try {
      const res = await sendMessage(conversationId, trimmed);

      // Response arrived — cancel masking before rendering.
      if (maskingTimerRef.current !== null) {
        window.clearTimeout(maskingTimerRef.current);
        maskingTimerRef.current = null;
      }
      stopSpeaking();
      setPhase("idle");

      saveTurn(conversationId, {
        id: newId(),
        role: "agent",
        text: res.reply,
        at: new Date().toISOString(),
      });
      setContext(res.context);
      setActions((prev) => [...prev, ...res.actions]);
      setPending(res.pendingConfirmation);
      if (res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        sessionStorage.setItem(SESSION_KEY, res.conversationId);
      }
    } catch (err) {
      if (maskingTimerRef.current !== null) {
        window.clearTimeout(maskingTimerRef.current);
        maskingTimerRef.current = null;
      }
      stopSpeaking();
      setPhase("idle");
      saveTurn(conversationId, {
        id: newId(),
        role: "agent",
        text: (err as Error).message,
        at: new Date().toISOString(),
        error: true,
      });
      setInput(trimmed);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  }

  function reset(): void {
    if (maskingTimerRef.current !== null) {
      window.clearTimeout(maskingTimerRef.current);
      maskingTimerRef.current = null;
    }
    stopSpeaking();
    setPhase("idle");

    const fresh = newId();
    sessionStorage.setItem(SESSION_KEY, fresh);
    setConversationId(fresh);
    turnsRef.current = [];
    setTurns([]);
    setChats((prev) => [
      {
        id: fresh,
        title: "New conversation",
        updatedAt: new Date().toISOString(),
        turns: [],
      },
      ...prev,
    ]);
    setContext(null);
    setActions([]);
    setPending(null);
    setInput("");
    setView("home");
    inputRef.current?.focus();
  }

  function openChat(chat: Chat): void {
    setConversationId(chat.id);
    sessionStorage.setItem(SESSION_KEY, chat.id);
    turnsRef.current = chat.turns;
    setTurns(chat.turns);
    setContext(null);
    setActions([]);
    setPending(null);
    setInput("");
    setView("history");
  }

  const systemState = busy
    ? "PROCESSING"
    : turns.length
      ? pending
        ? "AWAITING APPROVAL"
        : "READY FOR NEXT TASK"
      : "READY";
  const title = (
    {
      home: "Your day, made simpler.",
      tasks: "Task workspace",
      activity: "Activity stream",
      tools: "Remembered context",
      history: "Conversation history",
    } satisfies Record<View, string>
  )[view];

  return (
    <div className="app-shell">
      <header className="system-bar">
        <a
          className="brand"
          href="#home"
          onClick={() => setView("home")}
          aria-label="Independence home"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            DAYLIGHT<span className="brand-sub">INDEPENDENCE SYSTEM</span>
          </span>
        </a>
        <div className="system-readout">
          <span className="eyebrow">SYSTEM</span>
          <strong>{systemState}</strong>
        </div>
        <div className="connection">
          <span className="connection-dot" /> Connected{" "}
          <span className="connection-divider" />{" "}
          <span className="connection-label">ALEXA+ EXPERIENCE</span>
        </div>
      </header>

      <div className="app-frame">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="sidebar-label eyebrow">WORKSPACE</div>
          <nav className="nav-list">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${view === item.id ? " is-active" : ""}`}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <span className="nav-index">{item.index}</span>
                <span>{item.label}</span>
                <span className="nav-indicator" />
              </button>
            ))}
          </nav>
          <div className="recent-chats">
            <div className="sidebar-label eyebrow">RECENT CHATS</div>
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`recent-chat${conversationId === chat.id ? " is-current" : ""}`}
                onClick={() => openChat(chat)}
                title={chat.title}
              >
                <span>{chat.title}</span>
                <time>{new Date(chat.updatedAt).toLocaleDateString()}</time>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <span className="sidebar-spark">✳</span>
            <p>
              Small steps.
              <br />
              <strong>More independence.</strong>
            </p>
            <span className="version-tag">PREVIEW 01</span>
          </div>
        </aside>

        <main className="workspace" key={view}>
          <div className="workspace-topline">
            <span className="eyebrow">
              {view === "home"
                ? "A FRESH START"
                : `WORKSPACE / ${NAV.find((n) => n.id === view)?.index}`}
            </span>
            <button className="reset-button" type="button" onClick={reset}>
              <span aria-hidden="true">＋</span> New conversation
            </button>
          </div>

          {view === "home" ? (
            <section className="home-intro" aria-label="Welcome">
              <div className="intro-copy">
                <span className="eyebrow intro-kicker">
                  <span className="tiny-star">✳</span> YOUR PERSONAL DIGITAL
                  SIDEKICK
                </span>
                <h1>
                  Make room
                  <br />
                  for <span>your day.</span>
                </h1>
                <p>
                  Tell us what’s on your mind. We’ll help you understand it,
                  remember the details, and take the next step.
                </p>
              </div>
              <div className="state-stamp" aria-hidden="true">
                <div className="state-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span>
                  HERE WHEN
                  <br />
                  YOU NEED US
                </span>
              </div>
            </section>
          ) : (
            <section className="view-heading">
              <span className="view-mark">✳</span>
              <div>
                <span className="eyebrow">DAYLIGHT / {view.toUpperCase()}</span>
                <h1>{title}</h1>
              </div>
            </section>
          )}

          <section className="command-section" aria-labelledby="command-title">
            <div className="section-heading">
              <div>
                <h2 id="command-title">What can we make easier?</h2>
              </div>
              <span className="command-tag">
                <span className="tag-dot" /> READY FOR INPUT
              </span>
            </div>
            <div
              className={`command-console${busy ? " command-console--busy" : ""}`}
            >
              <label className="console-label" htmlFor="task-command">
                COMMAND <span>PRESS ENTER TO EXECUTE</span>
              </label>
              <textarea
                id="task-command"
                ref={inputRef}
                className="command-input"
                rows={2}
                placeholder={
                  interim ? "" : "I got a message from the electricity company…"
                }
                value={interim || input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                readOnly={Boolean(interim)}
              />
              <div className="console-footer">
                <span className="input-hint">
                  Be yourself. A little context helps us get it right.
                </span>
                <div className="console-actions">
                  <VoiceInput
                    onStart={() => {
                      setInput("");
                      setInterim("");
                    }}
                    onFinalTranscript={(t) => {
                      setInput(t);
                      setInterim("");
                    }}
                    onInterimTranscript={setInterim}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="execute-button"
                    onClick={() => void submit(input)}
                    disabled={busy || (input.trim().length === 0 && !interim)}
                  >
                    {busy ? (
                      <>
                        <span className="button-progress" /> Working
                      </>
                    ) : (
                      <>
                        Make it happen <span aria-hidden="true">↗</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              {busy && <div className="scan-line" aria-hidden="true" />}
            </div>
            {turns.length === 0 && !busy && (
              <div className="suggestions">
                <span className="eyebrow">A FEW PLACES TO START</span>
                <div className="suggestion-list">
                  <button
                    onClick={() =>
                      setInput(
                        "Help me understand this bill and remember when it’s due.",
                      )
                    }
                    type="button"
                  >
                    <span className="suggestion-symbol suggestion-symbol--yellow">
                      ↗
                    </span>{" "}
                    Understand a bill
                  </button>
                  <button
                    onClick={() =>
                      setInput(
                        "Remind me to take care of something later today.",
                      )
                    }
                    type="button"
                  >
                    <span className="suggestion-symbol suggestion-symbol--green">
                      ◷
                    </span>{" "}
                    Set a reminder
                  </button>
                  <button
                    onClick={() =>
                      setInput("Help me write a message to someone.")
                    }
                    type="button"
                  >
                    <span className="suggestion-symbol suggestion-symbol--pink">
                      ✳
                    </span>{" "}
                    Write a message
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="output-section" aria-live="polite">
            <div className="section-heading output-heading">
              <div>
                <h2>
                  {view === "home"
                    ? "What’s happening"
                    : view === "tasks" || view === "history"
                      ? "Conversation"
                      : title}
                </h2>
              </div>
              <span
                className={`state-label${busy ? " state-label--busy" : turns.length ? " state-label--done" : ""}`}
              >
                <span />
                {busy
                  ? "UNDERSTANDING REQUEST"
                  : turns.length
                    ? "TASK UPDATED"
                    : "SYSTEM READY"}
              </span>
            </div>
            <div className="workspace-content">
              {(view === "home" || view === "tasks" || view === "history") && (
                <div className="content-column">
                  <div className="content-subhead">
                    <span className="eyebrow">
                      {turns.length
                        ? `${String(turns.length).padStart(2, "0")} EVENTS`
                        : "TASK TIMELINE"}
                    </span>
                    <span className="subhead-rule" />
                  </div>
                  <Conversation turns={turns} busy={busy} phase={phase} />
                  {pending && (
                    <ConfirmationPrompt
                      pending={pending}
                      onConfirm={() => void submit("Yes.")}
                      onDeny={() => void submit("No.")}
                      disabled={busy}
                    />
                  )}
                </div>
              )}
              {(view === "home" || view === "tools") && (
                <div className="detail-column">
                  <div className="content-subhead">
                    <span className="eyebrow">MEMORY / CONTEXT</span>
                    <span className="context-signal">●</span>
                  </div>
                  <ContextPanel context={context} />
                </div>
              )}
              {(view === "home" || view === "activity") && (
                <div className="detail-column">
                  <div className="content-subhead">
                    <span className="eyebrow">COMPLETED STEPS</span>
                    <span className="activity-count">
                      {String(actions.length).padStart(2, "0")}
                    </span>
                  </div>
                  <ActionsPanel actions={actions} />
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
      <footer className="system-footer">
        <span>
          <span className="footer-light" /> DAYLIGHT SYSTEM
        </span>
        <span className="footer-center">
          {busy
            ? "Reading your request and preparing the next step"
            : pending
              ? "A message needs your approval before it can be sent"
              : "Your information stays in this conversation"}
        </span>
        <span className="footer-right">
          {busy ? "PROCESSING" : "ALL SYSTEMS READY"} <b>↗</b>
        </span>
      </footer>
    </div>
  );
}
