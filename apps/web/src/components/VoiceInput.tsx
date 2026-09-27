import { useRef, useState } from 'react';

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface Props {
  onTranscript: (text: string) => void;
  disabled: boolean;
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);

  function toggle() {
    if (listening) {
      ref.current?.stop();
      return;
    }

    const Ctor = getCtor();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }

    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? '';
      if (text) onTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    ref.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      className={`mic${listening ? ' mic--active' : ''}`}
      onClick={toggle}
      disabled={disabled || unsupported}
      title={
        unsupported
          ? 'Voice input is not supported in this browser'
          : listening
            ? 'Stop listening'
            : 'Speak'
      }
      aria-label={listening ? 'Stop listening' : 'Speak'}
    >
      {listening ? '■' : '🎙'}
    </button>
  );
}