import { LIBRARY } from '../content/library';
import type { Entry } from '../content/types';
import type { AppState } from './store';

/** xmur3 — small, fast, well-distributed string hash. */
function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function allEntries(state: AppState): Entry[] {
  return [...LIBRARY, ...state.customEntries];
}

/** Entries eligible for the draw: not hidden, and matching the theme focus. */
export function eligibleEntries(state: AppState): Entry[] {
  const { hidden, settings } = state;
  let pool = allEntries(state).filter((e) => !hidden.includes(e.id));
  if (settings.themeFocus !== 'all') {
    const focused = pool.filter((e) => e.theme === settings.themeFocus);
    // Falling back to the full pool beats showing nothing if a theme is empty.
    if (focused.length) pool = focused;
  }
  return pool;
}

/**
 * The entry for a given day. Deterministic — the same date and the same install
 * always produce the same draw, so closing and reopening the app mid-practice
 * doesn't swap the affirmation out from under you.
 *
 * Recently-seen entries are excluded first, so a 60-entry library cycles for
 * weeks before repeating rather than landing on the same line twice in a week.
 */
export function entryForDay(state: AppState, date: string): Entry {
  const pool = eligibleEntries(state);
  if (!pool.length) return LIBRARY[0];

  const lookback = Math.min(Math.max(pool.length - 1, 0), 25);
  const recent = new Set(
    state.history
      .filter((h) => h.date < date)
      .slice(-lookback)
      .flatMap((h) => h.entryIds),
  );

  const fresh = pool.filter((e) => !recent.has(e.id));
  const candidates = fresh.length ? fresh : pool;

  // Sorted so the index is stable even if entry insertion order changes.
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const index = hash(`${date}:${state.seed}`) % ordered.length;
  return ordered[index];
}

/** The entry actually shown for a past day, falling back to a fresh draw. */
export function entryById(state: AppState, id: string): Entry | undefined {
  return allEntries(state).find((e) => e.id === id);
}

/** Resolve a list of ids (e.g. a set's entryIds) to entries, in order,
 * silently dropping any that reference a since-deleted custom entry. */
export function resolveEntries(state: AppState, ids: string[]): Entry[] {
  const byId = new Map(allEntries(state).map((e) => [e.id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is Entry => e !== undefined);
}
