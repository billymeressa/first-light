import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from './content/types';
import { THEMES } from './content/types';
import { recordCompletion, useStore, type PracticeSet } from './state/store';
import { defaultSetForDay, resolveEntries } from './state/daily';
import { computeStreak } from './state/streak';
import { binaural } from './audio/binaural';
import { loadVoices } from './audio/speech';
import { gentleAlarm } from './audio/chime';
import { dayKey, msUntilNext } from './lib/date';
import { useCloudSync } from './state/cloud';
import { Home } from './components/Home';
import { Ritual } from './components/Ritual';
import { Streak } from './components/Streak';
import { Settings } from './components/Settings';
import { Library } from './components/Library';
import { Journal } from './components/Journal';
import { Account } from './components/Account';
import { TabBar, type Tab } from './components/TabBar';

type View = Tab | 'ritual' | 'account';

/** Titles for the slim top bar. 'home' is deliberately absent — the Today
 * screen is the one place the app should feel like a moment, not a page. */
const TITLES: Partial<Record<View, string>> = {
  streak: 'Practice',
  library: 'Library',
  journal: 'Journal',
  settings: 'Settings',
  account: 'Account',
};

interface Session {
  entries: Entry[];
  setName?: string;
}

/** Re-renders when the local calendar day rolls over, for apps left open overnight. */
function useToday(): string {
  const [today, setToday] = useState(dayKey);
  useEffect(() => {
    const id = setInterval(() => {
      const now = dayKey();
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export default function App() {
  const state = useStore();
  const today = useToday();
  const [view, setView] = useState<View>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [waking, setWaking] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const stopAlarm = useRef<(() => void) | null>(null);
  useCloudSync(state);

  const todaysSet = useMemo(
    () => defaultSetForDay(state, today, state.settings.defaultSetSize),
    [state, today],
  );
  const dates = useMemo(() => state.history.map((h) => h.date), [state.history]);
  const stats = useMemo(() => computeStreak(dates), [dates]);
  const projectedStreak = stats.doneToday
    ? stats.current
    : computeStreak([...dates, today]).current;

  const hue = THEMES.find((t) => t.id === todaysSet[0]?.theme)?.hue ?? 28;

  // ── Wake alarm ────────────────────────────────────────────────────────
  const { alarmEnabled, alarmTime } = state.settings;
  useEffect(() => {
    if (!alarmEnabled) return;
    let timer: ReturnType<typeof setTimeout>;

    const arm = () => {
      timer = setTimeout(() => {
        setWaking(true);
        stopAlarm.current = gentleAlarm();
        arm(); // Re-arm for tomorrow.
      }, msUntilNext(alarmTime));
    };
    arm();

    return () => clearTimeout(timer);
  }, [alarmEnabled, alarmTime]);

  useEffect(() => {
    if (!waking) return;
    const id = setInterval(() => setClock(new Date()), 10_000);
    setClock(new Date());
    return () => clearInterval(id);
  }, [waking]);

  const silenceAlarm = () => {
    stopAlarm.current?.();
    stopAlarm.current = null;
    setWaking(false);
  };

  // Voice lists load asynchronously in Chrome. Kick that off as soon as the
  // app opens rather than waiting for the first affirmation to need one, so
  // the opening line of the ritual doesn't sit through the load delay.
  useEffect(() => {
    void loadVoices();
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────
  const startSession = (next: Session) => {
    // Started inside the click handler: browsers only allow an AudioContext to
    // start from a user gesture, and an effect after render is too late in Safari.
    if (state.settings.binauralEnabled) void binaural.start(state.settings.binaural);
    setSession(next);
    setView('ritual');
  };

  const beginRitual = () => startSession({ entries: todaysSet });

  const beginSet = (set: PracticeSet) => {
    const resolved = resolveEntries(state, set.entryIds);
    if (!resolved.length) return; // Nothing left to practice — button is disabled for this case.
    startSession({ entries: resolved, setName: set.name });
  };

  const beginFromAlarm = () => {
    silenceAlarm();
    beginRitual();
  };

  return (
    <div
      className={`app${state.settings.reduceMotion ? ' reduce-motion' : ''}`}
      style={{ ['--hue' as string]: hue }}
    >
      <div className="aurora" />

      {waking && (
        <div className="wake">
          <div className="stack gap-sm center-col">
            <span className="eyebrow">Good morning</span>
            <p className="wake-time">
              {clock.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <p className="muted" style={{ maxWidth: '20rem', lineHeight: 1.6 }}>
            Take your time. When you're ready, the practice is here.
          </p>
          <div className="stack gap-sm center-col">
            <button className="btn btn-primary" onClick={beginFromAlarm}>
              Begin
            </button>
            <button className="btn-quiet" onClick={silenceAlarm}>
              Not yet
            </button>
          </div>
        </div>
      )}

      <div className={`screen${view === 'ritual' ? '' : ' has-tabbar'}`}>
        {view !== 'ritual' && (
          <header className="topbar">
            {view === 'account' ? (
              <button className="back-btn" onClick={() => setView('settings')}>
                ‹ Settings
              </button>
            ) : (
              <span className="eyebrow wordmark">
                {TITLES[view] ?? 'First Light'}
              </span>
            )}
          </header>
        )}

        {view === 'home' && (
          <Home
            entries={todaysSet}
            stats={stats}
            alarmTime={alarmEnabled ? alarmTime : null}
            sets={state.sets}
            onBegin={beginRitual}
            onBeginSet={beginSet}
            onViewStreak={() => setView('streak')}
          />
        )}

        {view === 'ritual' && session && (
          <Ritual
            entries={session.entries}
            setName={session.setName}
            settings={state.settings}
            streakAfter={projectedStreak}
            onFinish={(entryIds) => recordCompletion(entryIds, today, session.setName)}
            onExit={() => {
              setSession(null);
              setView('home');
            }}
          />
        )}

        {view === 'streak' && <Streak />}
        {view === 'library' && <Library />}
        {view === 'journal' && <Journal />}
        {view === 'settings' && <Settings onOpenAccount={() => setView('account')} />}
        {view === 'account' && <Account />}
      </div>

      {view !== 'ritual' && <TabBar current={view} onSelect={setView} />}
    </div>
  );
}
