/**
 * A soft struck-bell tone, used for the wake alarm and for marking transitions
 * in the ritual. Additive: a fundamental plus two quiet inharmonic partials,
 * each with its own exponential decay, which reads as a bell rather than a beep.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  return ctx;
}

export async function chime(opts: { freq?: number; gain?: number; decay?: number } = {}) {
  const { freq = 396, gain = 0.18, decay = 3.4 } = opts;
  const c = context();
  if (c.state === 'suspended') await c.resume();

  const now = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(gain, now);
  out.connect(c.destination);

  // Inharmonic ratios give the tone a struck-metal quality.
  const partials = [
    { ratio: 1, level: 1, decay: decay },
    { ratio: 2.76, level: 0.22, decay: decay * 0.55 },
    { ratio: 5.4, level: 0.09, decay: decay * 0.3 },
  ];

  for (const p of partials) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * p.ratio, now);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(p.level, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + p.decay + 0.1);
  }

  setTimeout(() => out.disconnect(), (decay + 0.3) * 1000);
}

/**
 * The wake alarm: the same bell, repeated, each one a little louder. Designed to
 * surface you rather than jolt you. Returns a cancel function.
 */
export function gentleAlarm(): () => void {
  let stopped = false;
  let round = 0;
  let timer: ReturnType<typeof setTimeout>;

  const tick = () => {
    if (stopped) return;
    const gain = Math.min(0.08 + round * 0.045, 0.42);
    void chime({ freq: 396, gain, decay: 4 });
    round++;
    timer = setTimeout(tick, Math.max(6500 - round * 400, 3500));
  };
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
