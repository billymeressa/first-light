import type { ReflectionResult } from './prompt';
import { supabase } from '../lib/supabase';

export type { GeneratedEntry, ReflectionResult } from './prompt';

/**
 * Journal reflection is powered by the app's own Claude/Gemini keys (see
 * api/_lib/reflect.ts) — not a key each user supplies. Since every call
 * costs the app owner money, it's gated on being signed in: this sends the
 * user's Supabase access token, and the server rejects the request without
 * one. There is no user-facing key to manage here anymore.
 */
export async function generateFromJournal(
  journalText: string,
  currentPortrait: string | null,
): Promise<ReflectionResult> {
  if (!supabase) throw new Error('Sign in to use Journal reflection.');

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in to use Journal reflection.');

  let res: Response;
  try {
    res = await fetch('/api/reflect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ journalText, currentPortrait }),
    });
  } catch {
    throw new Error('Could not reach reflection. Check your connection and try again.');
  }

  if (!res.ok) {
    let message = `Reflection failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the default message.
    }
    throw new Error(message);
  }

  return (await res.json()) as ReflectionResult;
}
