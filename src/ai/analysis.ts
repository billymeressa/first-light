import type { AnalyzeOutcome } from './prompt';
import { supabase } from '../lib/supabase';

export type {
  AffirmationResult,
  AnalysisResult,
  AnalyzeOutcome,
  Certainty,
  ClarifyResult,
} from './prompt';

/**
 * Runs a journal entry through an author lens. The provider keys live on the
 * server (see api/_lib/analyze.ts), not here — this just proves who's asking
 * by forwarding the Supabase access token, and the server rejects anything
 * without one.
 */
export async function analyzeEntry(entryText: string, lensId: string): Promise<AnalyzeOutcome> {
  if (!supabase) throw new Error('Sign in to use this.');

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in to use this.');

  let res: Response;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ entryText, lensId }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    let message = `Analysis failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the default message.
    }
    throw new Error(message);
  }

  return (await res.json()) as AnalyzeOutcome;
}
