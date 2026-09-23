import { useSyncExternalStore } from 'react';
import type { Entry, Theme } from '../content/types';
import { DEFAULT_BINAURAL, type BinauralSettings } from '../audio/binaural';
import { DEFAULT_SPEECH, type SpeechSettings } from '../audio/speech';

const KEY = 'first-light:v1';

export interface Settings {
  binauralEnabled: boolean;
  binaural: BinauralSettings;
  speech: SpeechSettings;
  /** Restrict the daily draw to one theme, or 'all' to rotate freely. */
  themeFocus: Theme | 'all';
  /** Seconds each line of the scene is held before the next appears. */
  scenePace: number;
  settleBreaths: number;
  /** How many times the affirmation is said before moving to the scene. */
  affirmationRepeats: number;
  alarmEnabled: boolean;
  /** Local "HH:MM". */
  alarmTime: string;
  reduceMotion: boolean;
}

export interface HistoryItem {
  date: string;
  entryId: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  customEntries: Entry[];
  /** Library entry ids the user has retired from the rotation. */
  hidden: string[];
  history: HistoryItem[];
  /** Stable per-install value so the daily draw differs between people. */
  seed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  binauralEnabled: true,
  binaural: { ...DEFAULT_BINAURAL },
  speech: { ...DEFAULT_SPEECH },
  themeFocus: 'all',
  scenePace: 11,
  settleBreaths: 4,
  affirmationRepeats: 2,
  alarmEnabled: false,
  alarmTime: '06:30',
  reduceMotion: false,
};

function initialState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    customEntries: [],
    hidden: [],
    history: [],
    seed: Math.floor(Math.random() * 2 ** 31),
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = initialState();
    // Merge field-by-field so a settings key added in a later version doesn't
    // come back undefined for existing users.
    return {
      version: 1,
      settings: {
        ...base.settings,
        ...parsed.settings,
        binaural: { ...base.settings.binaural, ...parsed.settings?.binaural },
        speech: { ...base.settings.speech, ...parsed.settings?.speech },
      },
      customEntries: parsed.customEntries ?? [],
      hidden: parsed.hidden ?? [],
      history: parsed.history ?? [],
      seed: parsed.seed ?? base.seed,
    };
  } catch {
    return initialState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — keep running in memory.
  }
}

// Write immediately on a first run. `seed` is randomised in `initialState`, so
// leaving it unsaved would re-roll it on every reload and quietly change which
// affirmation "today" resolves to each time the app is opened.
if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === null) {
  persist();
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function setState(update: (s: AppState) => AppState) {
  state = update(state);
  emit();
}

export function patchSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function recordCompletion(entryId: string, date: string) {
  setState((s) =>
    s.history.some((h) => h.date === date)
      ? s
      : { ...s, history: [...s.history, { date, entryId }] },
  );
}

export function addCustomEntry(entry: Entry) {
  setState((s) => ({ ...s, customEntries: [...s.customEntries, entry] }));
}

export function updateCustomEntry(id: string, patch: Partial<Entry>) {
  setState((s) => ({
    ...s,
    customEntries: s.customEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
}

export function deleteCustomEntry(id: string) {
  setState((s) => ({ ...s, customEntries: s.customEntries.filter((e) => e.id !== id) }));
}

export function toggleHidden(id: string) {
  setState((s) => ({
    ...s,
    hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id],
  }));
}

export function resetAll() {
  state = initialState();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
