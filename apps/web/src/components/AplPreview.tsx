interface Props {
  variant: 'confirmation' | 'context' | 'briefing';
}

export function AplPreview({ variant }: Props) {
  return (
    <div className="apl-preview">
      <div className="apl-preview__device">
        <div className="apl-preview__screen">
          {variant === 'confirmation' && <ConfirmationScreen />}
          {variant === 'context' && <ContextScreen />}
          {variant === 'briefing' && <BriefingScreen />}
        </div>
      </div>
      <p className="apl-preview__caption">
        Echo Show 8 · 1280×800 · APL design mockup
      </p>
    </div>
  );
}

function ConfirmationScreen() {
  return (
    <div className="apl-screen apl-screen--confirm">
      <div className="apl-confirm__heading">WAITING FOR YOUR CONFIRMATION</div>

      <div className="apl-confirm__row">
        <span className="apl-confirm__label">To</span>
        <span className="apl-confirm__name">Priya Sharma</span>
      </div>

      <div className="apl-confirm__channel">
        WhatsApp · +91 98765 43210
      </div>

      <div className="apl-confirm__message">
        My electricity bill is ₹1,842 and it's due 15 October.
      </div>

      <div className="apl-confirm__buttons">
        <button type="button" className="apl-confirm__yes">
          Yes, send it
        </button>
        <button type="button" className="apl-confirm__no">
          No, cancel
        </button>
      </div>
    </div>
  );
}

function ContextScreen() {
  return (
    <div className="apl-screen">
      <div className="apl-context__badge">ELECTRICITY</div>
      <div className="apl-context__amount">₹1,842</div>
      <div className="apl-context__field">
        <span>Due</span>
        <span>Sun, October 15</span>
      </div>
    </div>
  );
}

function BriefingScreen() {
  return (
    <div className="apl-screen">
      <div className="apl-briefing__greeting">Good morning.</div>
      <div className="apl-briefing__line">
        You have a clinic appointment at 10:30 AM today with Dr. Meera.
      </div>
      <div className="apl-briefing__line">
        Your property tax bill is due tomorrow.
      </div>
    </div>
  );
}