import type { PendingConfirmation } from '../types';

interface Props {
  pending: PendingConfirmation;
  onConfirm: () => void;
  onDeny: () => void;
  disabled: boolean;
}

export function ConfirmationPrompt({
  pending,
  onConfirm,
  onDeny,
  disabled,
}: Props) {
  return (
    <div className="confirm" role="alertdialog" aria-live="polite">
      <div className="confirm__icon" aria-hidden="true">
        ⏸
      </div>
      <div className="confirm__body">
        <div className="confirm__title">Waiting for your confirmation</div>
        <blockquote className="confirm__message">{pending.message}</blockquote>
        <div className="confirm__recipient">
          To: <strong>{pending.recipient}</strong>
        </div>
        <div className="confirm__actions">
          <button
            type="button"
            className="confirm__yes"
            onClick={onConfirm}
            disabled={disabled}
          >
            Yes, send it
          </button>
          <button
            type="button"
            className="confirm__no"
            onClick={onDeny}
            disabled={disabled}
          >
            No, cancel
          </button>
        </div>
      </div>
    </div>
  );
}