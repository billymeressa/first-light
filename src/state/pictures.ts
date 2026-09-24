/**
 * Local picture attachments — one photo per affirmation entry, so a line can
 * be paired with something personal rather than generic art. Same shape as
 * audio/recordings.ts: IndexedDB (not localStorage, images are too big for a
 * synchronous string store), local to this device, never synced — a photo
 * is a much bigger privacy step than text, so it stays off by default rather
 * than silently leaving the device the moment you sign in.
 */
import { useSyncExternalStore } from 'react';

const DB_NAME = 'first-light-pictures';
const STORE = 'pictures';

export interface StoredPicture {
  entryId: string;
  blob: Blob;
  updatedAt: string;
}

export const pictureSupported = typeof indexedDB !== 'undefined';

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

/** Downscales and re-encodes to keep IndexedDB usage sane — a phone photo
 * straight off the camera can be 5-10MB; nothing here needs more than a
 * screen's worth of detail. */
export async function downscaleImage(file: File, maxDimension = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process this image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image.'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function savePicture(entryId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  const record: StoredPicture = { entryId, blob, updatedAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  pictureIds.add(entryId);
  emit();
}

export async function deletePicture(entryId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  pictureIds.delete(entryId);
  emit();
}

export async function getPicture(entryId: string): Promise<StoredPicture | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(entryId);
    req.onsuccess = () => resolve(req.result as StoredPicture | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ── Synchronous "which entries have a picture" snapshot — same pattern as
// audio/recordings.ts's useRecordedIds. ────────────────────────────────────
let pictureIds = new Set<string>();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function loadPictureIds(): Promise<void> {
  if (!pictureSupported) return;
  const db = await openDB();
  const ids = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  pictureIds = new Set(ids as string[]);
  loaded = true;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) void loadPictureIds();
  return () => listeners.delete(listener);
}

function getSnapshot(): Set<string> {
  return pictureIds;
}

/** The set of entry ids that currently have a saved picture. */
export function usePictureIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
