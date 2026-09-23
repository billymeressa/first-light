/**
 * Day keys are local-calendar `YYYY-MM-DD`, never UTC. A ritual done at 6am on
 * the 3rd belongs to the 3rd regardless of timezone offset, and using
 * `toISOString()` here would silently shift the streak for anyone west of UTC.
 */

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, delta: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

/** Whole days between two keys, positive when `b` is later. DST-safe. */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const da = parseDayKey(a).getTime();
  const db = parseDayKey(b).getTime();
  return Math.round((db - da) / msPerDay);
}

/** "06:30" → minutes since local midnight. */
export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Milliseconds from now until the next occurrence of a local `HH:MM`. */
export function msUntilNext(hhmm: string, from: Date = new Date()): number {
  const target = new Date(from);
  const [h, m] = hhmm.split(':').map(Number);
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - from.getTime();
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Still night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
