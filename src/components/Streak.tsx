import { useStore } from '../state/store';
import { computeStreak, recentDays } from '../state/streak';
import { entryById } from '../state/daily';
import { dayKey, parseDayKey } from '../lib/date';

export function Streak() {
  const state = useStore();
  const dates = state.history.map((h) => h.date);
  const stats = computeStreak(dates);
  const days = recentDays(dates, 35);
  const today = dayKey();

  const recent = [...state.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);

  return (
    <div className="rise">
      <h1 className="affirmation" style={{ fontSize: '1.6rem' }}>
        Your practice
      </h1>

      <div className="stat-row">
        <div className="stat">
          <b>{stats.current}</b>
          <span>Current</span>
        </div>
        <div className="stat">
          <b>{stats.longest}</b>
          <span>Longest</span>
        </div>
        <div className="stat">
          <b>{stats.total}</b>
          <span>Mornings</span>
        </div>
      </div>

      <div className="section">
        <h2>Last five weeks</h2>
        <div className="calendar" aria-hidden="true">
          {days.map((d) => (
            <i
              key={d.key}
              className={`${d.done ? 'done' : ''}${d.key === today ? ' today' : ''}`}
            />
          ))}
        </div>
        <p className="faint" style={{ fontSize: '0.78rem', marginTop: '0.9rem' }}>
          {stats.total === 0
            ? 'Nothing here yet. One morning is enough to start.'
            : 'A missed day is a missed day. It is not a reason to stop.'}
        </p>
      </div>

      {recent.length > 0 && (
        <div className="history-list">
          <h2 className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Recent
          </h2>
          {recent.map((h) => {
            const label = h.setName
              ? `${h.setName} (${h.entryIds.length} affirmation${h.entryIds.length === 1 ? '' : 's'})`
              : (entryById(state, h.entryIds[0])?.affirmation ?? 'A practice');
            return (
              <div className="history-item" key={h.date}>
                <time dateTime={h.date}>
                  {parseDayKey(h.date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
                <span className="muted">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
