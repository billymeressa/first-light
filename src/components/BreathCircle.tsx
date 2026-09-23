import { useEffect, useState, type CSSProperties } from 'react';

/**
 * A 4–2–6 breath. The out-breath is deliberately longer than the in-breath;
 * that ratio is the part that actually settles you, and it's the reason the
 * orb contracts more slowly than it expands.
 */
const PHASES = [
  { key: 'in', label: 'Breathe in', ms: 4000, scale: 1 },
  { key: 'hold', label: 'Hold', ms: 2000, scale: 1 },
  { key: 'out', label: 'And out', ms: 6000, scale: 0.42 },
] as const;

interface Props {
  breaths: number;
  onComplete: () => void;
}

export function BreathCircle({ breaths, onComplete }: Props) {
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const current = PHASES[phase];
    const timer = setTimeout(() => {
      if (phase < PHASES.length - 1) {
        setPhase(phase + 1);
        return;
      }
      const next = cycle + 1;
      if (next >= breaths) {
        onComplete();
      } else {
        setCycle(next);
        setPhase(0);
      }
    }, current.ms);
    return () => clearTimeout(timer);
  }, [phase, cycle, breaths, onComplete]);

  const current = PHASES[phase];
  const orbStyle = {
    '--orb-scale': current.scale,
    // The hold phase must not animate, or the orb drifts during the pause.
    '--orb-dur': `${current.key === 'hold' ? 0 : current.ms}ms`,
  } as CSSProperties;

  return (
    <div className="breath">
      <div className="breath-orb" aria-hidden="true">
        <i style={orbStyle} />
      </div>
      <div className="center-col gap-sm">
        <p className="breath-cue" aria-live="polite">
          {current.label}
        </p>
        <p className="breath-count">
          {cycle + 1} of {breaths}
        </p>
      </div>
    </div>
  );
}
