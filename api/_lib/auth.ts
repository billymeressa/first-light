import { createClient } from '@supabase/supabase-js';

/**
 * Shared request auth for everything under /api.
 *
 * Every model call costs the app owner money, so each endpoint is gated on a
 * real signed-in Supabase user. Verification uses the anon/publishable key,
 * which is enough to validate a token — the service-role/secret key is never
 * needed here and deliberately stays out of this deployment entirely.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Resolves to the verified user's id, or throws ApiError(401). */
export async function verifyUser(accessToken: string | null): Promise<string> {
  if (!accessToken) throw new ApiError(401, 'Sign in to use this.');

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ApiError(500, 'Cloud sync is not configured on the server.');
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiError(401, 'Your session has expired — sign in again.');
  }
  return data.user.id;
}

/** Pulls the bearer token out of an Authorization header, if present. */
export function bearerToken(header: string | undefined): string | null {
  const value = header ?? '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}
