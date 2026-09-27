import type { ContextMatch } from '../types';

interface Props {
  context: ContextMatch | null;
}

function formatCurrency(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== 'number') return null;
  const cur = typeof currency === 'string' ? currency : 'INR';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString('en-IN')}`;
  }
}

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  });
}

export function ContextPanel({ context }: Props) {
  if (!context) {
    return (
      <div className="panel__empty">
        <p>No context yet.</p>
        <p className="panel__hint">
          Extracted facts will appear here once the agent understands what
          you're looking at.
        </p>
      </div>
    );
  }

  const { data, type, key } = context;

  if (type === 'bill') {
    const amount = formatCurrency(data.amount, data.currency);
    const dueDate = formatDate(data.dueDate);
    const provider =
      typeof data.provider === 'string' ? data.provider : 'Bill';

    return (
      <div className="context-card">
        <div className="context-card__header">
          <span className="context-card__badge">{provider}</span>
        </div>
        {amount && (
          <div className="context-card__field">
            <span className="context-card__label">Amount</span>
            <span className="context-card__value context-card__value--big">
              {amount}
            </span>
          </div>
        )}
        {dueDate && (
          <div className="context-card__field">
            <span className="context-card__label">Due</span>
            <span className="context-card__value">{dueDate}</span>
          </div>
        )}
        <div className="context-card__footer">
          Remembered as <code>{key}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="context-card">
      <div className="context-card__header">
        <span className="context-card__badge">{type}</span>
      </div>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="context-card__field">
          <span className="context-card__label">{k}</span>
          <span className="context-card__value">{String(v)}</span>
        </div>
      ))}
      <div className="context-card__footer">
        Remembered as <code>{key}</code>
      </div>
    </div>
  );
}