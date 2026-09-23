import { dayKey, addDays, daysBetween } from '../lib/date';

export interface StreakStats {
  current: number;
  longest: number;
  total: number;
  doneToday: boolean;
  /** True when yesterday was missed but today would restart a streak. */
  atRisk: boolean;
}

/**
 * Forgiving by design: a streak stays alive all day until midnight, so opening
 * the app at 11pm having not practised yet doesn't show a zero. Punishing the
 * user first thing in the morning is the opposite of what this app is for.
 */
export function computeStreak(dates: string[]): StreakStats {
  const set = new Set(dates);
  const today = dayKey();
  const doneToday = set.has(today);

  let cursor = doneToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }

  return {
    current,
    longest: Math.max(longest, current),
    total: set.size,
    doneToday,
    atRisk: !doneToday && current > 0,
  };
}

/** The last `count` days, oldest first, flagged for the calendar strip. */
export function recentDays(dates: string[], count = 35): { key: string; done: boolean }[] {
  const set = new Set(dates);
  const today = dayKey();
  const out: { key: string; done: boolean }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    out.push({ key, done: set.has(key) });
  }
  return out;
}
