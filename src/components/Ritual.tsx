import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '../content/types';
import { THEMES } from '../content/types';
import type { Settings } from '../state/store';
import { binaural } from '../audio/binaural';
import { speak, cancelSpeech } from '../audio/speech';
import { getRecording, playBlob, stopPlayback, useRecordedIds } from '../audio/recordings';
import { getPicture, usePictureIds } from '../state/pictures';
import { chime } from '../audio/chime';
import { BreathCircle } from './BreathCircle';

type Phase = 'settle' | 'affirmation' | 'done';

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

/** Silent hold for a repeat beat — the line was already said once; this is
 * just space for the user to say it back themselves, not another readout. */
const SILENT_REPEAT_HOLD = 6500;

export function Ritual({ entries, setName, settings, streakAfter, onFinish, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>(settings.settleBreaths > 0 ? 'settle' : 'affirmation');
  const [soundOn, setSoundOn] = useState(settings.binauralEnabled);
  const [entryIndex, setEntryIndex] = useState(0);
  const [repeatIndex, setRepeatIndex] = useState(0);
  const recorded = useRef(false);
  const recordedIds = useRecordedIds();
  const pictureIds = usePictureIds();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  const entry = entries[entryIndex];
  const isLastEntry = entryIndex + 1 >= entries.length;
  const repeatTotal = Math.max(1, Math.round(settings.affirmationRepeats));

  /**
   * Play a line — your own recorded voice if there is one for this entry,
   * otherwise synthesized speech — then hold it on screen. The hold is
   * measured from when the line appeared, not from when audio ended, so a
   * slow voice doesn't make every beat twice as long as the chosen pace.
   */
  const speakAndHold = useCallback(
    (entryToSpeak: Entry, paceMs: number, onDone: () => void) => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout>;
      const started = Date.now();

      const playback =
        settings.speech.enabled && recordedIds.has(entryToSpeak.id)
          ? getRecording(entryToSpeak.id).then((rec) =>
              rec ? playBlob(rec.blob, settings.speech.volume) : speak(entryToSpeak.affirmation, settings.speech),
            )
          : speak(entryToSpeak.affirmation, settings.speech);

      void playback.then(() => {
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
        stopPlayback();
      };
    },
    [settings.speech, recordedIds],
  );

  /** Move past the current entry's affirmation: into the next entry, or done. */
  const advancePastAffirmation = useCallback(() => {
    if (isLastEntry) {
      setPhase('done');
    } else {
      setEntryIndex((i) => i + 1);
      setRepeatIndex(0);
      setPhase('affirmation');
    }
  }, [isLastEntry]);

  // Load the current entry's picture, if it has one. Re-runs per entry, not
  // per repeat, since the photo doesn't change across repeats of the same line.
  useEffect(() => {
    if (!pictureIds.has(entry.id)) {
      setPictureUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void getPicture(entry.id).then((pic) => {
      if (cancelled || !pic) return;
      url = URL.createObjectURL(pic.blob);
      setPictureUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry.id, pictureIds]);

  // Keep the running tone in sync with live settings changes.
  useEffect(() => {
    if (soundOn) binaural.update(settings.binaural);
  }, [soundOn, settings.binaural]);

  // Tear everything down on the way out, however the user leaves.
  useEffect(() => {
    return () => {
      binaural.stop();
      cancelSpeech();
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'affirmation') return;

    const next = () => {
      if (repeatIndex + 1 < repeatTotal) setRepeatIndex((i) => i + 1);
      else advancePastAffirmation();
    };

    // Only the first beat is actually said — the line doesn't need repeating
    // by the app itself. Every beat after that is a silent, wider gap: room
    // for the user to say it back, not another readout talking over them.
    if (repeatIndex === 0) {
      const hold = settings.speech.enabled ? 4200 : 7500;
      return speakAndHold(entry, hold, next);
    }

    const timer = setTimeout(next, SILENT_REPEAT_HOLD);
    return () => clearTimeout(timer);
  }, [phase, repeatIndex, repeatTotal, entry, settings.speech.enabled, speakAndHold, advancePastAffirmation]);

  useEffect(() => {
    if (phase !== 'done' || recorded.current) return;
    recorded.current = true;
    binaural.stop();
    void chime({ freq: 528, gain: 0.14, decay: 4.5 });
    onFinish(entries.map((e) => e.id));
  }, [phase, onFinish, entries]);

  const advance = () => {
    cancelSpeech();
    stopPlayback();
    if (phase === 'settle') setPhase('affirmation');
    else if (phase === 'affirmation') advancePastAffirmation();
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
        {phase === 'affirmation' && pictureUrl && (
          <div className="ritual-picture" style={{ backgroundImage: `url(${pictureUrl})` }} />
        )}

        {isSession && phase === 'affirmation' && (
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
