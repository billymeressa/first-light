import { useEffect, useState, type ReactNode } from 'react';
import { THEMES, type Theme } from '../content/types';
import { patchSettings, resetAll, useStore } from '../state/store';
import { cloudSupported, useSession } from '../state/cloud';
import { IconAccount, IconChevron } from './Icons';
import { binaural, THETA_RANGE, type BinauralSettings } from '../audio/binaural';
import {
  loadVoices,
  rankVoices,
  speak,
  speechSupported,
  type SpeechSettings,
} from '../audio/speech';

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="row">
      <span className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="row-control">{children}</span>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="value">{format(value)}</span>
    </>
  );
}

interface SettingsProps {
  onOpenAccount: () => void;
}

export function Settings({ onOpenAccount }: SettingsProps) {
  const state = useStore();
  const { session } = useSession();
  const s = state.settings;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void loadVoices().then((v) => setVoices(rankVoices(v)));
  }, []);

  // Never leave a preview tone running when the user navigates away.
  useEffect(() => {
    return () => {
      if (binaural.isRunning) binaural.stop();
    };
  }, []);

  const setBinaural = (patch: Partial<BinauralSettings>) => {
    const next = { ...s.binaural, ...patch };
    patchSettings({ binaural: next });
    if (previewing) binaural.update(next);
  };

  const setSpeech = (patch: Partial<SpeechSettings>) =>
    patchSettings({ speech: { ...s.speech, ...patch } });

  const togglePreview = () => {
    if (previewing) {
      binaural.stop();
      setPreviewing(false);
    } else {
      void binaural.start(s.binaural);
      setPreviewing(true);
    }
  };

  return (
    <div className="rise">
      {cloudSupported && (
        <button className="account-row" onClick={onOpenAccount}>
          <span className="account-avatar">
            <IconAccount />
          </span>
          <span className="account-text">
            <b>{session ? (session.user.email ?? 'Your account') : 'Sign in'}</b>
            <small>{session ? 'Synced across your devices' : 'Sync your practice + use Reflect'}</small>
          </span>
          <span className="faint">
            <IconChevron />
          </span>
        </button>
      )}

      <section className="section">
        <h2>Practice</h2>
        <div style={{ marginBottom: '1.25rem' }}>
          <p className="faint" style={{ fontSize: '0.8rem', marginBottom: '0.7rem' }}>
            Focus on one theme, or let all five rotate.
          </p>
          <div className="chips">
            <button
              className="chip"
              aria-pressed={s.themeFocus === 'all'}
              onClick={() => patchSettings({ themeFocus: 'all' })}
            >
              All
            </button>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="chip"
                aria-pressed={s.themeFocus === t.id}
                onClick={() => patchSettings({ themeFocus: t.id as Theme })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Row label="Daily set size" hint="How many affirmations make up today's practice.">
          <Slider
            label="Daily set size"
            value={s.defaultSetSize}
            min={2}
            max={6}
            step={1}
            onChange={(v) => patchSettings({ defaultSetSize: v })}
            format={(v) => `${v}`}
          />
        </Row>

        <Row label="Settling breaths" hint="Slow breaths before the affirmation. Zero skips it.">
          <Slider
            label="Settling breaths"
            value={s.settleBreaths}
            min={0}
            max={10}
            step={1}
            onChange={(v) => patchSettings({ settleBreaths: v })}
            format={(v) => (v === 0 ? 'off' : String(v))}
          />
        </Row>

        <Row label="Repeat the affirmation" hint="How many times the line is said.">
          <Slider
            label="Repeat the affirmation"
            value={s.affirmationRepeats}
            min={1}
            max={5}
            step={1}
            onChange={(v) => patchSettings({ affirmationRepeats: v })}
            format={(v) => (v === 1 ? 'once' : `${v}×`)}
          />
        </Row>
      </section>

      <section className="section">
        <h2>Read aloud</h2>
        {!speechSupported && (
          <p className="note" style={{ marginBottom: '1rem' }}>
            This browser doesn't offer speech synthesis, so read-aloud is unavailable.
          </p>
        )}
        <Row
          label="Speak the affirmation"
          hint="Plays your recorded voice where you've added one (Library → Voice), otherwise your device's built-in voice. Nothing is sent anywhere."
        >
          <Switch
            label="Speak the affirmation"
            checked={s.speech.enabled && speechSupported}
            onChange={(v) => setSpeech({ enabled: v })}
          />
        </Row>

        {s.speech.enabled && speechSupported && (
          <>
            <Row label="Voice">
              <select
                aria-label="Voice"
                value={s.speech.voiceURI ?? ''}
                onChange={(e) => setSpeech({ voiceURI: e.target.value || null })}
              >
                <option value="">Automatic</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Speaking rate">
              <Slider
                label="Speaking rate"
                value={s.speech.rate}
                min={0.5}
                max={1.2}
                step={0.02}
                onChange={(v) => setSpeech({ rate: v })}
                format={(v) => `${v.toFixed(2)}×`}
              />
            </Row>

            <Row label="Voice volume">
              <Slider
                label="Voice volume"
                value={s.speech.volume}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setSpeech({ volume: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Row>

            <button
              className="btn-quiet"
              style={{ marginTop: '0.75rem' }}
              onClick={() => void speak('I am steady, and the day is mine.', s.speech)}
            >
              Hear a sample
            </button>
          </>
        )}
      </section>

      <section className="section">
        <h2>Background tone</h2>
        <p className="note" style={{ marginBottom: '1.25rem' }}>
          A binaural beat is the difference between two tones, one in each ear — your ears
          have to hear them separately, so it only works on headphones. On speakers you'll
          just hear a steady hum. Treat it as atmosphere for the practice, not as a
          treatment for anything.
        </p>

        <Row label="Play during practice">
          <Switch
            label="Play during practice"
            checked={s.binauralEnabled}
            onChange={(v) => patchSettings({ binauralEnabled: v })}
          />
        </Row>

        <Row label="Beat frequency" hint={`Theta is ${THETA_RANGE.min}–${THETA_RANGE.max} Hz.`}>
          <Slider
            label="Beat frequency"
            value={s.binaural.beatHz}
            min={2}
            max={12}
            step={0.5}
            onChange={(v) => setBinaural({ beatHz: v })}
            format={(v) => `${v} Hz`}
          />
        </Row>

        <Row label="Tone pitch" hint="The pitch both ears hear. Lower is warmer.">
          <Slider
            label="Tone pitch"
            value={s.binaural.carrierHz}
            min={90}
            max={300}
            step={2}
            onChange={(v) => setBinaural({ carrierHz: v })}
            format={(v) => `${v} Hz`}
          />
        </Row>

        <Row label="Tone volume">
          <Slider
            label="Tone volume"
            value={s.binaural.volume}
            min={0}
            max={0.8}
            step={0.02}
            onChange={(v) => setBinaural({ volume: v })}
            format={(v) => `${Math.round((v / 0.8) * 100)}%`}
          />
        </Row>

        <Row label="Soft noise bed" hint="A little filtered noise so the tone isn't bare.">
          <Slider
            label="Soft noise bed"
            value={s.binaural.noiseLevel}
            min={0}
            max={0.7}
            step={0.02}
            onChange={(v) => setBinaural({ noiseLevel: v })}
            format={(v) => `${Math.round((v / 0.7) * 100)}%`}
          />
        </Row>

        <Row label="Reverb / space" hint="How much the tone washes and lingers, rather than sitting flat.">
          <Slider
            label="Reverb / space"
            value={s.binaural.reverbLevel}
            min={0}
            max={0.8}
            step={0.02}
            onChange={(v) => setBinaural({ reverbLevel: v })}
            format={(v) => `${Math.round((v / 0.8) * 100)}%`}
          />
        </Row>

        <button className="btn btn-ghost" style={{ marginTop: '1.1rem' }} onClick={togglePreview}>
          {previewing ? 'Stop preview' : 'Preview the tone'}
        </button>
      </section>

      <section className="section">
        <h2>Wake alarm</h2>
        <p className="note" style={{ marginBottom: '1.25rem' }}>
          A browser can't reliably wake a sleeping phone, so this is an in-app alarm: it
          rings when First Light is open on screen — good on a bedside tablet or laptop.
          For a phone, keep using your system alarm and open this straight after.
        </p>

        <Row label="Gentle alarm">
          <Switch
            label="Gentle alarm"
            checked={s.alarmEnabled}
            onChange={(v) => patchSettings({ alarmEnabled: v })}
          />
        </Row>

        {s.alarmEnabled && (
          <Row label="Time">
            <input
              type="time"
              aria-label="Alarm time"
              value={s.alarmTime}
              onChange={(e) => patchSettings({ alarmTime: e.target.value })}
            />
          </Row>
        )}
      </section>

      <section className="section">
        <h2>Display</h2>
        <Row label="Reduce motion" hint="Shorten the fades and the breathing animation.">
          <Switch
            label="Reduce motion"
            checked={s.reduceMotion}
            onChange={(v) => patchSettings({ reduceMotion: v })}
          />
        </Row>
      </section>

      <section className="section">
        <h2>AI generation</h2>
        <p className="note">
          Journal → Reflect uses this app's own Claude/Gemini access — there's no key for you to
          manage. Since every reflection costs the app something, it only works when you're
          signed in — use the account row at the top of this screen.
        </p>
      </section>

      <section className="section">
        <h2>Your data</h2>
        <p className="note" style={{ marginBottom: '1.25rem' }}>
          {session ? (
            <>
              Signed in as <b>{session.user.email}</b> — your streak, settings, and everything
              you've written sync to your account. Manage sign-in from the account row at the
              top of this screen.
            </>
          ) : cloudSupported ? (
            <>
              Everything currently lives in this browser only — sign in from the account row at
              the top of this screen to sync your streak, settings, and everything you've
              written across devices. Clearing site data erases anything not synced.
            </>
          ) : (
            <>
              Everything — your streak, your settings, anything you've written — lives in this
              browser only. There's no account and no server. Clearing site data erases it.
            </>
          )}
        </p>
        {confirmReset ? (
          <div className="row-control">
            <button
              className="btn btn-ghost"
              onClick={() => {
                resetAll();
                setConfirmReset(false);
              }}
            >
              Yes, erase everything
            </button>
            <button className="btn-quiet" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn-quiet" onClick={() => setConfirmReset(true)}>
            Reset all data
          </button>
        )}
      </section>
    </div>
  );
}
