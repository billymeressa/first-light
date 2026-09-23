import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '../content/types';
import { THEMES } from '../content/types';
import type { Settings } from '../state/store';
import { binaural } from '../audio/binaural';
import { speak, cancelSpeech } from '../audio/speech';
import { chime } from '../audio/chime';
import { BreathCircle } from './BreathCircle';

type Phase = 'settle' | 'affirmation' | 'scene' | 'seal' | 'done';

interface Props {
  entry: Entry;
  settings: Settings;
  streakAfter: number;
  onFinish: () => void;
  onExit: () => void;
}

/** Minimum beat a line is held for, even if speech ran long. */
const MIN_HOLD = 2200;

export function Ritual({ entry, settings, streakAfter, onFinish, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>(settings.settleBreaths > 0 ? 'settle' : 'affirmation');
  const [soundOn, setSoundOn] = useState(settings.binauralEnabled);
  const [repeatIndex, setRepeatIndex] = useState(0);
  const recorded = useRef(false);

  const repeatTotal = Math.max(1, Math.round(settings.affirmationRepeats));

  // The scene is authored one moment per line but read as a single paragraph.
  const sceneText = entry.scene.join(' ');

  /**
   * Speak a line, then hold it on screen. The hold is measured from when the
   * line appeared, not from when speech ended, so a slow voice doesn't make
   * every beat twice as long as the user's chosen pace.
   */
  const speakAndHold = useCallback(
    (text: string, paceMs: number, onDone: () => void) => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout>;
      const started = Date.now();

      void speak(text, settings.speech).then(() => {
        if (cancelled) return;
        const remaining = Math.max(paceMs - (Date.now() - started), MIN_HOLD);
        timer = setTimeout(() => {
          if (!cancelled) onDone();
        }, remaining);
      });

      return () => {
        cancelled = true;
        clearTimeout(timer);
        cancelSpeech();
      };
    },
    [settings.speech],
  );

  // Keep the running tone in sync with live settings changes.
  useEffect(() => {
    if (soundOn) binaural.update(settings.binaural);
  }, [soundOn, settings.binaural]);

  // Tear everything down on the way out, however the user leaves.
  useEffect(() => {
    return () => {
      binaural.stop();
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'affirmation') return;
    const hold = settings.speech.enabled ? 4200 : 7500;
    return speakAndHold(entry.affirmation, hold, () => {
      if (repeatIndex + 1 < repeatTotal) setRepeatIndex((i) => i + 1);
      else setPhase('scene');
    });
  }, [phase, repeatIndex, repeatTotal, entry.affirmation, settings.speech.enabled, speakAndHold]);

  useEffect(() => {
    if (phase !== 'scene') return;
    // Still paced per line, so a longer scene dwells proportionally longer.
    const hold = settings.scenePace * entry.scene.length * 1000;
    return speakAndHold(sceneText, hold, () => setPhase('seal'));
  }, [phase, sceneText, entry.scene.length, settings.scenePace, speakAndHold]);

  useEffect(() => {
    if (phase !== 'seal') return;
    return speakAndHold(entry.seal, 9000, () => setPhase('done'));
  }, [phase, entry.seal, speakAndHold]);

  useEffect(() => {
    if (phase !== 'done' || recorded.current) return;
    recorded.current = true;
    binaural.stop();
    void chime({ freq: 528, gain: 0.14, decay: 4.5 });
    onFinish();
  }, [phase, onFinish]);

  const advance = () => {
    cancelSpeech();
    if (phase === 'settle') setPhase('affirmation');
    else if (phase === 'affirmation') setPhase('scene');
    else if (phase === 'scene') setPhase('seal');
    else if (phase === 'seal') setPhase('done');
  };

  const toggleSound = () => {
    if (soundOn) {
      binaural.stop();
      setSoundOn(false);
    } else {
      void binaural.start(settings.binaural);
      setSoundOn(true);
    }
  };

  const themeLabel = THEMES.find((t) => t.id === entry.theme)?.label ?? entry.theme;

  return (
    <div className="ritual">
      <div className="ritual-body">
        {phase === 'settle' && (
          <div className="soften">
            <BreathCircle
              breaths={settings.settleBreaths}
              onComplete={() => setPhase('affirmation')}
            />
          </div>
        )}

        {phase === 'affirmation' && (
          <div className="stack gap-md rise" key={`${entry.id}-${repeatIndex}`}>
            <span className="theme-tag">{themeLabel}</span>
            <p className="affirmation">{entry.affirmation}</p>
            {repeatTotal > 1 && (
              <span className="faint" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                {repeatIndex + 1} of {repeatTotal}
              </span>
            )}
          </div>
        )}

        {phase === 'scene' && (
          <div className="stack gap-md rise">
            <span className="eyebrow">Picture it</span>
            <p className="scene-line" aria-live="polite">
              {sceneText}
            </p>
          </div>
        )}

        {phase === 'seal' && (
          <div className="stack gap-md rise">
            <span className="eyebrow">Hold the feeling</span>
            <p className="affirmation">{entry.seal}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="center-col gap-lg soften">
            <div className="stack gap-sm center-col">
              <span className="eyebrow">Complete</span>
              <p className="affirmation">{entry.affirmation}</p>
            </div>
            <p className="muted">
              {streakAfter === 1
                ? 'Day one. Come back tomorrow.'
                : `${streakAfter} days in a row.`}
            </p>
            <button className="btn btn-primary" onClick={onExit}>
              Close
            </button>
          </div>
        )}
      </div>

      {phase !== 'done' && (
        <div className="ritual-foot">
          <button className="btn-quiet" onClick={onExit}>
            End
          </button>

          <div className="row-control">
            <button
              className="btn-quiet"
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? 'Mute the tone' : 'Play the tone'}
            >
              {soundOn ? 'Sound on' : 'Sound off'}
            </button>
            <button className="btn-quiet" onClick={advance}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
