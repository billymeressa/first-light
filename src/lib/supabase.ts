/**
 * Cloud sync backend. Supabase (Postgres + auth) rather than a server of our
 * own — the app stays a static site, same deploy model as before, just with
 * one more browser-side client alongside the Claude/Gemini ones.
 *
 * Entirely optional: if the env vars aren't set, `cloudSupported` is false
 * and every caller in state/cloud.ts no-ops, so the app still runs local-only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudSupported = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudSupported ? createClient(url!, anonKey!) : null;
