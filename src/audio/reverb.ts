/**
 * A synthetic reverb impulse response — exponentially decaying stereo noise,
 * generated in-browser so the ambient effects need no network fetch, matching
 * the rest of the app. Convolving any signal with this produces a soft,
 * enveloping tail rather than a discrete echo.
 *
 * AudioBuffers aren't tied to the context that created them, so one buffer is
 * cached and reused across every ConvolverNode in the app (the binaural
 * engine's tone context and the chime's separate context both use it),
 * avoiding regenerating a few hundred thousand samples on every chime.
 */

let cached: { key: string; buffer: AudioBuffer } | null = null;

export function reverbImpulse(ctx: AudioContext, seconds = 3.6, decay = 2.4): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}:${decay}`;
  if (cached && cached.key === key) return cached.buffer;

  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  cached = { key, buffer };
  return buffer;
}
