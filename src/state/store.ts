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
  /** How many affirmations make up today's default practice set. */
  defaultSetSize: number;
  settleBreaths: number;
  /** How many times through each affirmation before moving on — the first
   * couple are read aloud, the rest held silently for the user to say back. */
  affirmationRepeats: number;
  alarmEnabled: boolean;
  /** Local "HH:MM". */
  alarmTime: string;
  reduceMotion: boolean;
}

export interface HistoryItem {
  date: string;
  /** The affirmations practiced that day, in practice order. */
  entryIds: string[];
  /** Present when the practice was a saved set rather than the daily pick. */
  setName?: string;
}

export interface PracticeSet {
  id: string;
  name: string;
  /** Entry ids in practice order. */
  entryIds: string[];
}

export interface JournalEntry {
  id: string;
  /** ISO datetime of when the entry was written. */
  createdAt: string;
  text: string;
  /** Set once this entry has been read through a lens. */
  analyzedAt?: string;
  /** The custom library entries this entry ultimately produced and the user kept. */
  generatedEntryIds?: string[];
}

export interface PortraitVersion {
  text: string;
  /** ISO datetime this version was written. */
  date: string;
}

/** What a lens noticed in one journal entry — step 2 of the pipeline. Kept
 * whether or not it produced an affirmation, so a rejected suggestion can
 * still be traced back to what prompted it. */
export interface Analysis {
  id: string;
  journalId: string;
  lensId: string;
  observation: string;
  /** Phrases from the entry itself, already verified server-side. */
  supportingQuotes: string[];
  certainty: 'high' | 'medium' | 'low';
  reasoning: string;
  createdAt: string;
}

/** An affirmation proposed off an analysis. Never applied silently — it stays
 * 'proposed' until the user explicitly acts on it. */
export interface LensAffirmation {
  id: string;
  analysisId: string;
  /** As generated. Preserved even after an edit, so the two can be compared. */
  text: string;
  status: 'proposed' | 'confirmed' | 'edited' | 'rejected';
  /** Present when status is 'edited' — what the user rewrote it to. */
  editedText?: string;
  createdAt: string;
  resolvedAt?: string;
  /** The library entry created on confirm/edit, if any. */
  entryId?: string;
}

/** The low-certainty branch: a question waiting for the user, whenever they
 * feel like answering. Deliberately not blocking anything. */
export interface PendingReflection {
  id: string;
  journalId: string;
  lensId: string;
  reflection: string;
  question: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  customEntries: Entry[];
  /** Library entry ids the user has retired from the rotation. */
  hidden: string[];
  history: HistoryItem[];
  sets: PracticeSet[];
  journal: JournalEntry[];
  /** Oldest first; the last entry is the current portrait. */
  portraitHistory: PortraitVersion[];
  analyses: Analysis[];
  lensAffirmations: LensAffirmation[];
  pendingReflections: PendingReflection[];
  /** Stable per-install value so the daily draw differs between people. */
  seed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  binauralEnabled: true,
  binaural: { ...DEFAULT_BINAURAL },
  speech: { ...DEFAULT_SPEECH },
  themeFocus: 'all',
  defaultSetSize: 3,
  settleBreaths: 4,
  affirmationRepeats: 4,
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
    sets: [],
    journal: [],
    portraitHistory: [],
    analyses: [],
    lensAffirmations: [],
    pendingReflections: [],
    seed: Math.floor(Math.random() * 2 ** 31),
  };
}

/** A history item from before sets existed, when each day held one entry. */
interface LegacyHistoryItem {
  date: string;
  entryId?: string;
  entryIds?: string[];
  setName?: string;
}

function migrateHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as LegacyHistoryItem[]).map((h) => ({
    date: h.date,
    entryIds: h.entryIds ?? (h.entryId ? [h.entryId] : []),
    ...(h.setName ? { setName: h.setName } : {}),
  }));
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
      history: migrateHistory(parsed.history),
      sets: parsed.sets ?? [],
      journal: parsed.journal ?? [],
      portraitHistory: parsed.portraitHistory ?? [],
      analyses: parsed.analyses ?? [],
      lensAffirmations: parsed.lensAffirmations ?? [],
      pendingReflections: parsed.pendingReflections ?? [],
      seed: parsed.seed ?? base.seed,
    };
  } catch {
    return initialState();
  }
}

/** Overwrite local state with a version pulled from the cloud (e.g. on
 * sign-in). There's nothing device-local left to preserve — AI generation
 * keys live only on the server now, not in AppState. */
export function applyRemoteState(remote: AppState) {
  setState((s) => ({ ...s, ...remote, settings: { ...s.settings, ...remote.settings } }));
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

export function recordCompletion(entryIds: string[], date: string, setName?: string) {
  setState((s) =>
    s.history.some((h) => h.date === date)
      ? s
      : { ...s, history: [...s.history, { date, entryIds, ...(setName ? { setName } : {}) }] },
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

/** A set is a handful of affirmations the user wants to move through in one
 * sitting — curated independently of the daily draw and its theme focus. */
export function createSet(name: string): string {
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  setState((s) => ({ ...s, sets: [...s.sets, { id, name, entryIds: [] }] }));
  return id;
}

export function renameSet(id: string, name: string) {
  setState((s) => ({ ...s, sets: s.sets.map((set) => (set.id === id ? { ...set, name } : set)) }));
}

export function setSetEntries(id: string, entryIds: string[]) {
  setState((s) => ({
    ...s,
    sets: s.sets.map((set) => (set.id === id ? { ...set, entryIds } : set)),
  }));
}

export function deleteSet(id: string) {
  setState((s) => ({ ...s, sets: s.sets.filter((set) => set.id !== id) }));
}

export function addJournalEntry(text: string): string {
  const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  setState((s) => ({
    ...s,
    journal: [...s.journal, { id, text, createdAt: new Date().toISOString() }],
  }));
  return id;
}

export function deleteJournalEntry(id: string) {
  // Cascade: an analysis, its proposed affirmation, or a question hanging off
  // a deleted entry has nothing left to refer back to.
  setState((s) => {
    const goneAnalyses = s.analyses.filter((a) => a.journalId === id).map((a) => a.id);
    return {
      ...s,
      journal: s.journal.filter((e) => e.id !== id),
      analyses: s.analyses.filter((a) => a.journalId !== id),
      lensAffirmations: s.lensAffirmations.filter((a) => !goneAnalyses.includes(a.analysisId)),
      pendingReflections: s.pendingReflections.filter((r) => r.journalId !== id),
    };
  });
}

// ── Lens pipeline ─────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Stores what a lens noticed, and stamps the source entry as analysed. */
export function addAnalysis(input: Omit<Analysis, 'id' | 'createdAt'>): string {
  const id = newId('an');
  setState((s) => ({
    ...s,
    analyses: [...s.analyses, { ...input, id, createdAt: new Date().toISOString() }],
    journal: s.journal.map((e) =>
      e.id === input.journalId ? { ...e, analyzedAt: new Date().toISOString() } : e,
    ),
  }));
  return id;
}

/** Records a proposed affirmation. Always lands as 'proposed' — nothing is
 * treated as true about the user until they say so. */
export function addProposedAffirmation(analysisId: string, text: string): string {
  const id = newId('af');
  setState((s) => ({
    ...s,
    lensAffirmations: [
      ...s.lensAffirmations,
      { id, analysisId, text, status: 'proposed', createdAt: new Date().toISOString() },
    ],
  }));
  return id;
}

/** Resolves a proposed affirmation. `entryId` is set when the user kept it and
 * a library entry was created; `editedText` when they rewrote it first. */
export function resolveAffirmation(
  id: string,
  status: 'confirmed' | 'edited' | 'rejected',
  opts: { editedText?: string; entryId?: string } = {},
) {
  setState((s) => ({
    ...s,
    lensAffirmations: s.lensAffirmations.map((a) =>
      a.id === id
        ? {
            ...a,
            status,
            resolvedAt: new Date().toISOString(),
            ...(opts.editedText ? { editedText: opts.editedText } : {}),
            ...(opts.entryId ? { entryId: opts.entryId } : {}),
          }
        : a,
    ),
    journal: opts.entryId
      ? s.journal.map((e) => {
          const analysis = s.analyses.find(
            (an) => an.id === s.lensAffirmations.find((a) => a.id === id)?.analysisId,
          );
          return analysis && e.id === analysis.journalId
            ? { ...e, generatedEntryIds: [...(e.generatedEntryIds ?? []), opts.entryId!] }
            : e;
        })
      : s.journal,
  }));
}

export function addPendingReflection(
  input: Omit<PendingReflection, 'id' | 'createdAt' | 'resolved'>,
): string {
  const id = newId('pr');
  setState((s) => ({
    ...s,
    pendingReflections: [
      ...s.pendingReflections,
      { ...input, id, resolved: false, createdAt: new Date().toISOString() },
    ],
    journal: s.journal.map((e) =>
      e.id === input.journalId ? { ...e, analyzedAt: new Date().toISOString() } : e,
    ),
  }));
  return id;
}

export function resolvePendingReflection(id: string) {
  setState((s) => ({
    ...s,
    pendingReflections: s.pendingReflections.map((r) =>
      r.id === id ? { ...r, resolved: true, resolvedAt: new Date().toISOString() } : r,
    ),
  }));
}

/** Appends a new "person I want to be" version. The prior version is kept. */
export function addPortraitVersion(text: string) {
  setState((s) => ({
    ...s,
    portraitHistory: [...s.portraitHistory, { text, date: new Date().toISOString() }],
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
