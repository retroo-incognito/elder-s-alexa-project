import { useEffect, useRef } from 'react';
import type { Turn } from '../types';

interface Props {
  turns: Turn[];
  busy: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Conversation({ turns, busy }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  if (turns.length === 0) {
    return (
      <div className="conversation__empty">
        <p>Start by saying something like:</p>
        <p className="conversation__hint">
          "I got a message from the electricity company. I don't understand it."
        </p>
      </div>
    );
  }

  return (
    <div className="conversation__turns">
      {turns.map((turn) => (
        <div key={turn.id} className={`turn turn--${turn.role}`}>
          <div className={`turn__bubble${turn.error ? ' turn__bubble--error' : ''}`}>
            {turn.text}
          </div>
          <div className="turn__meta">
            {turn.role === 'user' ? 'You' : 'Agent'} · {formatTime(turn.at)}
          </div>
        </div>
      ))}

      {busy && (
        <div className="turn turn--agent">
          <div className="turn__bubble turn__bubble--typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}