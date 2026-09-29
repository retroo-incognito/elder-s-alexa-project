import { useEffect, useRef } from 'react';
import type { Turn } from '../types';

interface Props { turns: Turn[]; busy: boolean }
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function Conversation({ turns, busy }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, busy]);
  if (turns.length === 0 && !busy) return <div className="timeline-empty"><span className="empty-index">01</span><div><strong>Waiting for your next task.</strong><p>Your activity will appear here as we work through it together.</p></div><span className="ready-mark">READY</span></div>;
  return <div className="timeline">
    {turns.map((turn, index) => <article key={turn.id} className={`timeline-entry timeline-entry--${turn.role}${turn.error ? ' timeline-entry--error' : ''}`}>
      <span className={`timeline-node${turn.role === 'agent' && !turn.error ? ' timeline-node--agent' : ''}`} />
      <div className="timeline-entry__body"><div className="timeline-entry__meta"><span>{turn.role === 'user' ? 'YOUR REQUEST' : turn.error ? 'CONNECTION ISSUE' : 'DAYLIGHT RESPONSE'}</span><span>{String(index + 1).padStart(2, '0')} / {formatTime(turn.at)}</span></div><p>{turn.text}</p></div>
    </article>)}
    {busy && <article className="timeline-entry timeline-entry--processing"><span className="timeline-node timeline-node--processing"/><div className="timeline-entry__body"><div className="timeline-entry__meta"><span>UNDERSTANDING REQUEST</span><span>IN PROGRESS</span></div><p className="processing-copy"><span className="processing-rail"><i /></span>Reading your request and preparing a helpful next step</p></div></article>}
    <div ref={endRef} />
  </div>;
}
