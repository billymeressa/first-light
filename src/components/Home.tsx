import type { Entry } from '../content/types';
import { THEMES } from '../content/types';
import type { StreakStats } from '../state/streak';
import { greeting } from '../lib/date';

interface Props {
  entry: Entry;
  stats: StreakStats;
  alarmTime: string | null;
  onBegin: () => void;
  onViewStreak: () => void;
}

export function Home({ entry, stats, alarmTime, onBegin, onViewStreak }: Props) {
  const themeLabel = THEMES.find((t) => t.id === entry.theme)?.label ?? entry.theme;

  return (
    <div className="home-main">
      <div className="stack gap-md rise">
        <span className="eyebrow">{greeting()}</span>
        {stats.doneToday ? (
          <>
            <p className="affirmation">{entry.affirmation}</p>
            <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
              Today's practice is done. You can sit with it again any time.
            </p>
          </>
        ) : (
          <>
            <p className="affirmation">
              One line, one scene.
              <br />
              <span className="muted">A few minutes before the day starts.</span>
            </p>
            <span className="theme-tag">Today · {themeLabel}</span>
          </>
        )}
      </div>

      <div className="home-actions soften">
        <button className="btn btn-primary" onClick={onBegin}>
          {stats.doneToday ? 'Sit with it again' : 'Begin'}
        </button>

        <button
          className="btn-quiet"
          onClick={onViewStreak}
          aria-label="View your practice history"
          style={{ alignSelf: 'flex-start' }}
        >
          <span className="streak-pill">
            {stats.current > 0 ? (
              <>
                <b>{stats.current}</b> day{stats.current === 1 ? '' : 's'} in a row
                {stats.atRisk && <span className="faint"> · not yet today</span>}
              </>
            ) : stats.total > 0 ? (
              <>
                <b>{stats.total}</b> mornings so far
              </>
            ) : (
              <>Start your first morning</>
            )}
          </span>
        </button>
      </div>

      {alarmTime && (
        <p className="faint soften" style={{ fontSize: '0.78rem' }}>
          Wake alarm set for {alarmTime}. It rings while this app is open.
        </p>
      )}
    </div>
  );
}
