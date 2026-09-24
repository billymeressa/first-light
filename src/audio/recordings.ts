/**
 * Local voice recordings — one per affirmation entry, so a line can be heard
 * in your own voice instead of a synthesized one. Stored as audio blobs in
 * IndexedDB rather than localStorage: even a few seconds of audio is too big
 * for a synchronous string-based store, and IndexedDB holds Blobs natively.
 * Nothing ever leaves the device.
 */
import { useSyncExternalStore } from 'react';

const DB_NAME = 'first-light-recordings';
const STORE = 'recordings';

export interface StoredRecording {
  entryId: string;
  blob: Blob;
  /** Milliseconds. */
  duration: number;
  updatedAt: string;
}

export const recordingSupported =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof MediaRecorder !== 'undefined' &&
  typeof indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'entryId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function saveRecording(entryId: string, blob: Blob, duration: number): Promise<void> {
  const db = await openDB();
  const record: StoredRecording = { entryId, blob, duration, updatedAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  recordedIds.add(entryId);
  emit();
}

export async function deleteRecording(entryId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  recordedIds.delete(entryId);
  emit();
}

export async function getRecording(entryId: string): Promise<StoredRecording | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(entryId);
    req.onsuccess = () => resolve(req.result as StoredRecording | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ── Synchronous "which entries have a recording" snapshot ──────────────────
// Playback and list rendering both need to know instantly whether an entry
// has a recording; IndexedDB is async, so a Set is kept in memory and loaded
// once, then updated in lockstep with every save/delete.
let recordedIds = new Set<string>();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function loadRecordedIds(): Promise<void> {
  if (!recordingSupported) return;
  const db = await openDB();
  const ids = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  recordedIds = new Set(ids as string[]);
  loaded = true;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) void loadRecordedIds();
  return () => listeners.delete(listener);
}

function getSnapshot(): Set<string> {
  return recordedIds;
}

/** The set of entry ids that currently have a saved recording. */
export function useRecordedIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Playback ─────────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;

/** Play a recorded blob, resolving when it ends, errors, or is stopped. */
export function playBlob(blob: Blob, volume: number): Promise<void> {
  stopPlayback();
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = Math.min(Math.max(volume, 0), 1);
    currentAudio = audio;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) currentAudio = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(finish);
  });
}

export function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
