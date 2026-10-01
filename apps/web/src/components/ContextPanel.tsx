import type { ContextMatch, ContextRisk } from "../types";

interface Props {
  context: ContextMatch | null;
}

function formatCurrency(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== "number") return null;
  const cur = typeof currency === "string" ? currency : "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString("en-IN")}`;
  }
}

function formatDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

function renderFieldValue(key: string, value: unknown): string {
  if (typeof value !== "string") return String(value);

  // Dates — format consistently
  if (/date$/i.test(key) || key === "dueDate" || key === "deadline") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        month: "long",
        day: "numeric",
      });
    }
    // "12 November" style — pass through
    return value;
  }

  // Times — keep as-is
  if (/time$/i.test(key)) return value;

  return value;
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function RiskBadge({ risk }: { risk: ContextRisk | undefined }) {
  if (!risk || risk.level === 'low') return null;

  const label = risk.level === 'high' ? 'Flagged as suspicious' : 'Caution';
  const className =
    risk.level === 'high'
      ? 'context-card__risk context-card__risk--high'
      : 'context-card__risk context-card__risk--medium';

  return (
    <div className={className}>
      <div className="context-card__risk-label">{label}</div>
      {risk.signals.length > 0 && (
        <div className="context-card__risk-signals">
          {risk.signals.map((s) => s.replace(/-/g, ' ')).join(' · ')}
        </div>
      )}
    </div>
  );
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
  const source = context.sourceContent && (
      <div className="context-card__source">
        <div className="context-card__source-label">From</div>
        <div className="context-card__source-text">{context.sourceContent}</div>
      </div>
    );
  if (type === "bill") {
    const amount = formatCurrency(data.amount, data.currency);
    const dueDate = formatDate(data.dueDate);
    const provider = typeof data.provider === "string" ? data.provider : "Bill";
    const risk = (data.__risk as ContextRisk | undefined);

    return (
      <div className="context-card">
        <RiskBadge risk={risk} />
        <div className="context-card__header">
          <span className="context-card__badge">{provider}</span>
        </div>
        {source}
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
      {source}
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="context-card__field">
          <span className="context-card__label">{formatFieldLabel(k)}</span>
          <span className="context-card__value">{renderFieldValue(k, v)}</span>
        </div>
      ))}
      <div className="context-card__footer">
        Remembered as <code>{key}</code>
      </div>
    </div>
  );
}
