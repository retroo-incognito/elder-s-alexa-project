let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Plays a short two-tone chime. Web Audio API — no asset to load.
 * ~250ms total. Designed to feel like a soft "noted" acknowledgement,
 * not an alert.
 */
export function playThinkingChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Chrome suspends the context until a gesture. The send-button click
  // counts, so this is a no-op in practice.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(720, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(540, ctx.currentTime + 0.18);

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.26);
}

/**
 * Speaks a short phrase via the browser's SpeechSynthesis API.
 * Returns true if speech started, false if unsupported.
 */
export function speak(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  u.pitch = 1.0;
  u.volume = 0.6;

  // Prefer an English voice if available; fall back to default.
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.startsWith('en'));
  if (preferred) u.voice = preferred;

  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}