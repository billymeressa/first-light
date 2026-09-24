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

/** Seeded PRNG (mulberry32) — small, fast, good enough distribution for a
 * deterministic daily shuffle. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates, seeded by a string so the same seed always
 * produces the same shuffle. */
function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const rand = mulberry32(hash(seedStr));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A small, shuffled set of affirmations for the given day — practiced
 * together in one sitting, since a single line reads as too short on its own.
 * Deterministic per date + install, so closing and reopening the app
 * mid-practice doesn't swap the set out from under you, and "Sit with it
 * again" naturally replays the same set.
 *
 * Entries seen in just-enough recent history are excluded first, sized to
 * leave exactly `setSize` fresh candidates — the whole library cycles through
 * before anything repeats, rather than reshuffling the same handful early.
 */
export function defaultSetForDay(state: AppState, date: string, setSize: number): Entry[] {
  const pool = eligibleEntries(state);
  if (!pool.length) return LIBRARY.slice(0, Math.max(1, setSize));

  const size = Math.min(Math.max(setSize, 1), pool.length);

  const targetRecent = Math.max(pool.length - size, 0);
  const recent = new Set<string>();
  const pastHistory = [...state.history]
    .filter((h) => h.date < date)
    .sort((a, b) => b.date.localeCompare(a.date));
  outer: for (const h of pastHistory) {
    for (const id of h.entryIds) {
      if (recent.size >= targetRecent) break outer;
      recent.add(id);
    }
  }

  const candidates = pool.filter((e) => !recent.has(e.id));
  if (candidates.length < size) {
    // Wrapping into a new cycle — top up with whatever's left, still
    // avoiding duplicates within today's own set.
    const chosen = new Set(candidates.map((e) => e.id));
    for (const e of pool) {
      if (candidates.length >= size) break;
      if (!chosen.has(e.id)) {
        candidates.push(e);
        chosen.add(e.id);
      }
    }
  }

  // Sorted first so the shuffle input is stable even if entry insertion
  // order changes, then seeded-shuffled for the day's practice order.
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  return seededShuffle(ordered, `${date}:${state.seed}`).slice(0, size);
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
