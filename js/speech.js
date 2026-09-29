// Озвучка голосом браузера (Web Speech API) — бесплатно и без интернета, если в системе есть японский голос.
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice = null;

function pickVoice() {
  if (!supported) return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
  // Предпочитаем «естественные»/онлайн-голоса, они звучат лучше.
  voice = voices.find((v) => /natural|online|google/i.test(v.name)) || voices[0] || null;
  return voice;
}

if (supported) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export const canSpeak = () => supported;
export const japaneseVoice = () => voice || pickVoice();

export function speak(text) {
  if (!supported || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const v = japaneseVoice();
  if (v) u.voice = v;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
