import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '../content/types';
import { THEMES } from '../content/types';
import type { Settings } from '../state/store';
import { binaural } from '../audio/binaural';
import { speak, cancelSpeech } from '../audio/speech';
import { chime } from '../audio/chime';
import { BreathCircle } from './BreathCircle';

type Phase = 'settle' | 'affirmation' | 'scene' | 'done';

interface Props {
  /** One or more affirmations to move through in this sitting. */
  entries: Entry[];
  /** The saved set's name, when practicing one. Undefined for the daily pick. */
  setName?: string;
  settings: Settings;
  streakAfter: number;
  onFinish: (entryIds: string[]) => void;
  onExit: () => void;
}

/** Minimum beat a line is held for, even if speech ran long. */
const MIN_HOLD = 2200;

export function Ritual({ entries, setName, settings, streakAfter, onFinish, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>(settings.settleBreaths > 0 ? 'settle' : 'affirmation');
  const [soundOn, setSoundOn] = useState(settings.binauralEnabled);
  const [entryIndex, setEntryIndex] = useState(0);
  const [repeatIndex, setRepeatIndex] = useState(0);
  const recorded = useRef(false);

  const entry = entries[entryIndex];
  const isLastEntry = entryIndex + 1 >= entries.length;
  const repeatTotal = Math.max(1, Math.round(settings.affirmationRepeats));

  // The scene is authored one moment per line but read as a single paragraph.
  // The seal — the feeling the entry closes on — is folded in as its final
  // beat, rather than shown as its own screen, so "picture it" always carries
  // the emotional payoff instead of stopping at the neutral imagery.
  const sceneText = entry.scene.join(' ');
  const fullSceneText = `${sceneText} ${entry.seal}`;

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

  /** Move past the current entry's scene: into the next entry, or done. */
  const advancePastScene = useCallback(() => {
    if (isLastEntry) {
      setPhase('done');
    } else {
      setEntryIndex((i) => i + 1);
      setRepeatIndex(0);
      setPhase('affirmation');
    }
  }, [isLastEntry]);

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
    // Paced per line plus one beat for the seal, so a longer scene — and its
    // closing feeling — both get proportionally more room to land.
    const hold = settings.scenePace * (entry.scene.length + 1) * 1000;
    return speakAndHold(fullSceneText, hold, advancePastScene);
  }, [phase, fullSceneText, entry.scene.length, settings.scenePace, speakAndHold, advancePastScene]);

  useEffect(() => {
    if (phase !== 'done' || recorded.current) return;
    recorded.current = true;
    binaural.stop();
    void chime({ freq: 528, gain: 0.14, decay: 4.5 });
    onFinish(entries.map((e) => e.id));
  }, [phase, onFinish, entries]);

  const advance = () => {
    cancelSpeech();
    if (phase === 'settle') setPhase('affirmation');
    else if (phase === 'affirmation') setPhase('scene');
    else if (phase === 'scene') advancePastScene();
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
  const isSession = entries.length > 1;

  return (
    <div className="ritual">
      <div className="ritual-body">
        {isSession && (phase === 'affirmation' || phase === 'scene') && (
          <p className="faint session-tag">
            {setName ?? 'Practice'} · {entryIndex + 1} of {entries.length}
          </p>
        )}

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
              {sceneText} <span className="scene-feeling">{entry.seal}</span>
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="center-col gap-lg soften">
            <div className="stack gap-sm center-col">
              <span className="eyebrow">Complete</span>
              {isSession ? (
                <>
                  <p className="affirmation">{setName ?? 'Practice complete.'}</p>
                  <p className="muted">
                    {entries.length} affirmations, one sitting.
                  </p>
                </>
              ) : (
                <p className="affirmation">{entry.affirmation}</p>
              )}
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
