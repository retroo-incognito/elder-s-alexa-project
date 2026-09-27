import type { AgentAction } from '../types';

interface Props {
  actions: AgentAction[];
}

const ACTION_LABELS: Record<string, string> = {
  context_saved: 'Understood',
  reminder_created: 'Reminder set',
  message_drafted: 'Draft prepared',
  message_sent: 'Message sent',
  message_cancelled: 'Message cancelled',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActionsPanel({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="panel__empty">
        <p>Nothing yet.</p>
        <p className="panel__hint">
          Actions will appear here as the agent completes each step.
        </p>
      </div>
    );
  }

  return (
    <ul className="action-list">
      {actions.map((action, i) => (
        <li
          key={`${action.at}-${i}`}
          className={`action-item action-item--${action.type}`}
        >
          <span className="action-item__dot" />
          <div className="action-item__body">
            <div className="action-item__label">
              {ACTION_LABELS[action.type] ?? action.type}
            </div>
            <div className="action-item__summary">{action.summary}</div>
          </div>
          <span className="action-item__time">{formatTime(action.at)}</span>
        </li>
      ))}
    </ul>
  );
}