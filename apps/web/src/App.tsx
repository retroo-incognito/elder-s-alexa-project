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
  Turn,
} from "./types";

const SESSION_KEY = "independence-agent.conversationId";

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

export default function App() {
  const [conversationId, setConversationId] = useState(loadConversationId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [context, setContext] = useState<ContextMatch | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setInput("");

    const userTurn: Turn = {
      id: newId(),
      role: "user",
      text: trimmed,
      at: new Date().toISOString(),
    };
    setTurns((prev) => [...prev, userTurn]);

    try {
      const res = await sendMessage(conversationId, trimmed);

      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: "agent",
          text: res.reply,
          at: new Date().toISOString(),
        },
      ]);
      setContext(res.context);
      setActions((prev) => [...prev, ...res.actions]);
      setPending(res.pendingConfirmation);

      if (res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        sessionStorage.setItem(SESSION_KEY, res.conversationId);
      }
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: "agent",
          text: (err as Error).message,
          at: new Date().toISOString(),
          error: true,
        },
      ]);
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
    const fresh = newId();
    sessionStorage.setItem(SESSION_KEY, fresh);
    setConversationId(fresh);
    setTurns([]);
    setContext(null);
    setActions([]);
    setPending(null);
    setInput("");
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">Everyday Independence Agent</h1>
          <p className="app__subtitle">
            Simulated Alexa+ experience — voice-first help for everyday digital
            tasks.
          </p>
        </div>
        <button type="button" className="app__reset" onClick={reset}>
          New conversation
        </button>
      </header>

      <main className="app__grid">
        <section className="panel panel--conversation">
          <h2 className="panel__title">Conversation</h2>
          <div className="panel__body">
            <Conversation turns={turns} busy={busy} />
          </div>

          {pending && (
            <ConfirmationPrompt
              pending={pending}
              onConfirm={() => void submit("Yes.")}
              onDeny={() => void submit("No.")}
              disabled={busy}
            />
          )}

          <div className="composer">
            <textarea
              ref={inputRef}
              className="composer__input"
              rows={1}
              placeholder={interim ? "" : "Say something…"}
              value={interim || input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              readOnly={Boolean(interim)}
            />
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
              className="composer__send"
              onClick={() => void submit(input)}
              disabled={busy || (input.trim().length === 0 && !interim)}
            >
              Send
            </button>
          </div>
        </section>

        <section className="panel panel--context">
          <h2 className="panel__title">Context</h2>
          <div className="panel__body">
            <ContextPanel context={context} />
          </div>
        </section>

        <section className="panel panel--actions">
          <h2 className="panel__title">Actions</h2>
          <div className="panel__body">
            <ActionsPanel actions={actions} />
          </div>
        </section>
      </main>
    </div>
  );
}
