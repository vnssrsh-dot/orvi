// Pronunciation: pre-generated mp3 (filled by the TTS script) first, Web Speech API as fallback.
let voice = null;
let current = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  return (
    en.find((v) => /en[-_]GB/i.test(v.lang) && /female|libby|sonia|serena|kate|google uk english female/i.test(v.name)) ||
    en.find((v) => /en[-_]GB/i.test(v.lang)) ||
    en.find((v) => /en[-_]US/i.test(v.lang)) ||
    en[0] ||
    null
  );
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  voice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text, { audio, slow = false, enabled = true } = {}) {
  if (!enabled || !text) return;
  stop();
  if (audio) {
    const a = new Audio(audio);
    a.playbackRate = slow ? 0.75 : 1;
    current = a;
    a.play().catch(() => speakSynth(text, slow));
    return;
  }
  speakSynth(text, slow);
}

function speakSynth(text, slow) {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang || 'en-GB';
  if (voice) u.voice = voice;
  u.rate = slow ? 0.6 : 0.9;
  speechSynthesis.speak(u);
}

export function stop() {
  if (current) { try { current.pause(); } catch {} current = null; }
  if (canSpeak()) speechSynthesis.cancel();
}
