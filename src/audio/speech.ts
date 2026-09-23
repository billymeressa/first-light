/**
 * Read-aloud via the browser's on-device speech synthesis. No network, no API
 * key, no audio leaves the machine.
 *
 * Voice lists populate asynchronously in Chrome, so `loadVoices` waits for the
 * `voiceschanged` event rather than trusting the first (usually empty) call.
 */

export interface SpeechSettings {
  enabled: boolean;
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
}

export const DEFAULT_SPEECH: SpeechSettings = {
  enabled: true,
  voiceURI: null,
  rate: 0.78,
  pitch: 0.95,
  volume: 0.9,
};

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported) return Promise.resolve([]);

  const immediate = window.speechSynthesis.getVoices();
  if (immediate.length) {
    cachedVoices = immediate;
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

// Eddy is the preferred default (the request was "Eddy/Eddie, US"). It's an
// Apple voice available on recent macOS/iOS — where it exists, this floats it
// to the top; where it doesn't, ranking falls through the rest of the list
// instead of failing, since a device without it shouldn't lose read-aloud.
const PREFERRED = ['eddy', 'eddie', 'samantha', 'serena', 'daniel', 'karen', 'moira', 'fiona', 'alex', 'ava', 'zoe'];

export function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices]
    .filter((v) => v.lang.startsWith('en'))
    .sort((a, b) => {
      const ai = PREFERRED.findIndex((p) => a.name.toLowerCase().includes(p));
      const bi = PREFERRED.findIndex((p) => b.name.toLowerCase().includes(p));
      const aScore = ai === -1 ? 99 : ai;
      const bScore = bi === -1 ? 99 : bi;
      if (aScore !== bScore) return aScore - bScore;
      // Among an equally-preferred name (e.g. regional Eddy variants), prefer
      // US English specifically, per the request.
      const aUS = a.lang === 'en-US' ? 0 : 1;
      const bUS = b.lang === 'en-US' ? 0 : 1;
      if (aUS !== bUS) return aUS - bUS;
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function resolveVoice(uri: string | null): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) cachedVoices = window.speechSynthesis.getVoices();
  if (uri) {
    const match = cachedVoices.find((v) => v.voiceURI === uri);
    if (match) return match;
  }
  return rankVoices(cachedVoices)[0] ?? null;
}

/**
 * Speak a line. Resolves when the utterance finishes, is cancelled, or errors —
 * never rejects, because a failed read-aloud should not break the ritual flow.
 */
export async function speak(text: string, settings: SpeechSettings): Promise<void> {
  if (!speechSupported || !settings.enabled || !text.trim()) return;

  // Voices populate asynchronously in Chrome: `getVoices()` returns `[]` on a
  // fresh page until `voiceschanged` fires. Wait for that at least once before
  // concluding there are none — otherwise the very first affirmation (before
  // anything else has triggered a voice load) silently never speaks.
  const voices = cachedVoices.length ? cachedVoices : await loadVoices();

  // Some environments (headless Chrome, locked-down Linux builds) expose the
  // API but ship no voices at all even after waiting. `speak` there never
  // fires `onend`, which would stall the ritual on every line, so treat it as
  // read-aloud being unavailable rather than hanging.
  if (!voices.length) return;

  return new Promise((resolve) => {
    // Chrome keeps a queue; a stale utterance would otherwise play over this one.
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voice = resolveVoice(settings.voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    u.volume = settings.volume;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(keepAlive);
      clearTimeout(hardStop);
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;

    // Chrome silently stops long utterances after ~15s unless poked.
    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        finish();
        return;
      }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 5000);

    // Backstop: a dropped `onend` must never leave the ritual waiting forever.
    // ~2.6 words/sec at rate 1.0, plus generous slack.
    const words = text.trim().split(/\s+/).length;
    const estimateMs = (words / (2.6 * Math.max(settings.rate, 0.3))) * 1000 + 6000;
    const hardStop = setTimeout(finish, estimateMs);

    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech() {
  if (speechSupported) window.speechSynthesis.cancel();
}
