import { useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
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
  onStart: () => void;
  onFinalTranscript: (text: string) => void;
  onInterimTranscript: (text: string) => void;
  disabled: boolean;
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  onStart,
  onFinalTranscript,
  onInterimTranscript,
  disabled,
}: Props) {
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
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        onFinalTranscript(finalText.trim());
        onInterimTranscript('');
      } else if (interimText) {
        onInterimTranscript(interimText);
      }
    };

    rec.onend = () => {
      setListening(false);
      onInterimTranscript('');
    };

    rec.onerror = () => {
      setListening(false);
      onInterimTranscript('');
    };

    ref.current = rec;
    onStart();          // ← signal App to reset before we start
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