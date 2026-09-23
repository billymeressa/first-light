import { reverbImpulse } from './reverb';

/**
 * Binaural tone generator.
 *
 * Two sine carriers, hard-panned left and right, offset by `beatHz`. The beat
 * is perceived in the head rather than present in either channel, so this only
 * works on headphones — the UI says so. A quiet low-passed noise bed sits
 * underneath because bare sines are thin and fatiguing over ten minutes.
 *
 * The two carrier tones stay completely dry. Reverb, the filter sweep, and
 * the stereo drift are all applied to the noise bed only — running the tones
 * through a convolver would smear the precise per-ear frequency difference
 * the whole effect depends on, which is the one thing here that must stay
 * exact. The "hypnotic" quality — reverb wash, a slow breathing tremolo on
 * the whole mix, a drifting filter — comes from everything around the tones,
 * not the tones themselves.
 *
 * Every gain change is ramped. Setting an AudioParam directly on a running
 * oscillator produces an audible click, which is exactly the wrong texture for
 * this app.
 */

export const THETA_RANGE = { min: 4, max: 8 } as const;
const FADE_IN = 3.0;
const FADE_OUT = 2.0;
const RAMP = 0.15;

export interface BinauralSettings {
  /** Difference between the ears, in Hz. Theta is 4–8. */
  beatHz: number;
  /** Base pitch both ears hear, in Hz. */
  carrierHz: number;
  /** 0–1. */
  volume: number;
  /** 0–1, relative to volume. */
  noiseLevel: number;
  /** 0–1. How much the noise bed washes through the reverb tail. */
  reverbLevel: number;
}

export const DEFAULT_BINAURAL: BinauralSettings = {
  beatHz: 6,
  carrierHz: 150,
  volume: 0.35,
  noiseLevel: 0.25,
  reverbLevel: 0.35,
};

/** Pink-ish noise via the Voss-McCartney approximation. Softer than white. */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 4;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buffer;
}

export class BinauralEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private left: OscillatorNode | null = null;
  private right: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private reverbSend: GainNode | null = null;
  // Slow LFOs driving the "hypnotic" motion — a breathing tremolo on the
  // whole mix, a drifting lowpass sweep, and a slow pan on the reverb wash.
  private breathGain: GainNode | null = null;
  private breathLfo: OscillatorNode | null = null;
  private filterLfo: OscillatorNode | null = null;
  private wetPanLfo: OscillatorNode | null = null;
  private settings: BinauralSettings = { ...DEFAULT_BINAURAL };
  private running = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  get isRunning() {
    return this.running;
  }

  /** Must be called from a user gesture the first time, per autoplay policy. */
  async start(settings?: Partial<BinauralSettings>) {
    this.settings = { ...this.settings, ...settings };

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.running) {
      this.apply();
      return;
    }

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { beatHz, carrierHz, volume, noiseLevel, reverbLevel } = this.settings;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);

    // A slow amplitude "breath" on the whole mix, roughly the same 12-second
    // cadence as the settle breath. Both ears scale together and in phase, so
    // it never touches the interaural difference the binaural cue depends on
    // — it just makes the tone feel alive instead of static.
    this.breathGain = ctx.createGain();
    this.breathGain.gain.setValueAtTime(1, now);
    this.breathLfo = ctx.createOscillator();
    this.breathLfo.frequency.setValueAtTime(1 / 12, now);
    const breathDepth = ctx.createGain();
    breathDepth.gain.setValueAtTime(0.07, now);
    this.breathLfo.connect(breathDepth).connect(this.breathGain.gain);
    this.breathLfo.start(now);

    this.master.connect(this.breathGain).connect(ctx.destination);

    const half = beatHz / 2;
    this.left = ctx.createOscillator();
    this.left.type = 'sine';
    this.left.frequency.setValueAtTime(carrierHz - half, now);
    const lPan = ctx.createStereoPanner();
    lPan.pan.setValueAtTime(-1, now);
    this.left.connect(lPan).connect(this.master);

    this.right = ctx.createOscillator();
    this.right.type = 'sine';
    this.right.frequency.setValueAtTime(carrierHz + half, now);
    const rPan = ctx.createStereoPanner();
    rPan.pan.setValueAtTime(1, now);
    this.right.connect(rPan).connect(this.master);

    this.noise = ctx.createBufferSource();
    this.noise.buffer = makeNoiseBuffer(ctx);
    this.noise.loop = true;

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseFilter.frequency.setValueAtTime(520, now);
    this.noiseFilter.Q.setValueAtTime(0.7, now);

    // The cutoff drifts instead of sitting still — most of what reads as
    // "hypnotic" rather than merely "ambient" is that slow, unresolved motion.
    this.filterLfo = ctx.createOscillator();
    this.filterLfo.frequency.setValueAtTime(1 / 19, now);
    const filterDepth = ctx.createGain();
    filterDepth.gain.setValueAtTime(180, now);
    this.filterLfo.connect(filterDepth).connect(this.noiseFilter.frequency);
    this.filterLfo.start(now);

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.setValueAtTime(noiseLevel, now);
    this.noise.connect(this.noiseFilter).connect(this.noiseGain);
    this.noiseGain.connect(this.master); // dry

    // Reverb send: only the noise bed washes through the convolver, with a
    // slow pan drift on the wet signal for a sense of shifting space.
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.setValueAtTime(reverbLevel, now);
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse(ctx);
    const wetPan = ctx.createStereoPanner();
    this.wetPanLfo = ctx.createOscillator();
    this.wetPanLfo.frequency.setValueAtTime(1 / 23, now);
    const wetPanDepth = ctx.createGain();
    wetPanDepth.gain.setValueAtTime(0.6, now);
    this.wetPanLfo.connect(wetPanDepth).connect(wetPan.pan);
    this.wetPanLfo.start(now);

    this.noiseGain.connect(this.reverbSend).connect(convolver).connect(wetPan).connect(this.master);

    this.left.start(now);
    this.right.start(now);
    this.noise.start(now);

    this.master.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + FADE_IN);
    this.running = true;
  }

  /** Live-update a running engine (or just record settings if stopped). */
  update(patch: Partial<BinauralSettings>) {
    this.settings = { ...this.settings, ...patch };
    if (this.running) this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const { beatHz, carrierHz, volume, noiseLevel, reverbLevel } = this.settings;
    const half = beatHz / 2;

    this.left?.frequency.linearRampToValueAtTime(carrierHz - half, now + RAMP);
    this.right?.frequency.linearRampToValueAtTime(carrierHz + half, now + RAMP);
    this.noiseGain?.gain.linearRampToValueAtTime(noiseLevel, now + RAMP);
    this.reverbSend?.gain.linearRampToValueAtTime(reverbLevel, now + RAMP);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0002), now);
    this.master.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + RAMP);
  }

  stop() {
    if (!this.running || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0002), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);

    const left = this.left, right = this.right, noise = this.noise;
    const breathLfo = this.breathLfo, filterLfo = this.filterLfo, wetPanLfo = this.wetPanLfo;
    this.stopTimer = setTimeout(() => {
      try {
        left?.stop();
        right?.stop();
        noise?.stop();
        breathLfo?.stop();
        filterLfo?.stop();
        wetPanLfo?.stop();
        left?.disconnect();
        right?.disconnect();
        noise?.disconnect();
        breathLfo?.disconnect();
        filterLfo?.disconnect();
        wetPanLfo?.disconnect();
        this.noiseFilter?.disconnect();
        this.noiseGain?.disconnect();
        this.reverbSend?.disconnect();
        this.breathGain?.disconnect();
        this.master?.disconnect();
      } catch {
        // Nodes already torn down — nothing to do.
      }
      this.left = this.right = null;
      this.noise = null;
      this.noiseGain = null;
      this.noiseFilter = null;
      this.reverbSend = null;
      this.breathGain = null;
      this.breathLfo = null;
      this.filterLfo = null;
      this.wetPanLfo = null;
      this.master = null;
      this.stopTimer = null;
    }, (FADE_OUT + 0.2) * 1000);

    this.running = false;
  }

  /** Release the AudioContext entirely. */
  async dispose() {
    this.stop();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') {
      // Let the fade finish before pulling the context out from under it.
      setTimeout(() => void ctx.close().catch(() => {}), (FADE_OUT + 0.3) * 1000);
    }
  }
}

export const binaural = new BinauralEngine();
