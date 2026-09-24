/**
 * Auth + cloud sync. Wraps Supabase auth (email/password) and a single
 * `app_state` row per user holding the synced slice of AppState as JSON.
 *
 * Entirely optional: every export here degrades gracefully when
 * `cloudSupported` is false (no env vars configured) — the app just stays
 * local-only, same as before this feature existed.
 */
import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudSupported, supabase } from '../lib/supabase';
import { applyRemoteState, type AppState } from './store';

export { cloudSupported };

// ── Auth session — a small external store, same pattern as state/store.ts ──
interface SessionSnapshot {
  session: Session | null;
  loaded: boolean;
}

// useSyncExternalStore requires getSnapshot to return a stable reference
// when nothing has changed — a fresh object literal on every call trips its
// "cache your snapshot" loop guard. So the snapshot itself is the one thing
// mutated in place, and only ever replaced when session or loaded changes.
let snapshot: SessionSnapshot = { session: null, loaded: !cloudSupported };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setSnapshot(next: SessionSnapshot) {
  snapshot = next;
  emit();
}

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    setSnapshot({ session: data.session, loaded: true });
  });
  supabase.auth.onAuthStateChange((_event, next) => {
    setSnapshot({ session: next, loaded: true });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SessionSnapshot {
  return snapshot;
}

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ── Sync ─────────────────────────────────────────────────────────────────
export async function fetchCloudState(userId: string): Promise<AppState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('app_state').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.state as AppState | undefined) ?? null;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function pushCloudState(userId: string, syncState: AppState) {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void supabase!.from('app_state').upsert({
      user_id: userId,
      state: syncState,
      updated_at: new Date().toISOString(),
    });
  }, 800);
}

/**
 * Call once (in App) with the current local state. On sign-in, pulls the
 * cloud copy and merges it in — or, for a brand-new account with nothing
 * saved yet, seeds the cloud with whatever's local. After that, every local
 * change is pushed up (debounced) for as long as a session is active.
 */
export function useCloudSync(state: AppState): void {
  const { session: current } = useSession();
  const userId = current?.user.id ?? null;
  const pulledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || pulledFor.current === userId) return;
    pulledFor.current = userId;
    void fetchCloudState(userId).then((remote) => {
      if (remote) applyRemoteState(remote);
      else pushCloudState(userId, state);
    });
    // `state` intentionally excluded — this effect should only re-run when
    // the signed-in user changes, not on every local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    pushCloudState(userId, state);
  }, [userId, state]);
}
