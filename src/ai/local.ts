import type { ReflectionResult } from './prompt';

/**
 * The machine-local generation path: posts to /api/reflect, a Vite dev-server
 * middleware (see vite.config.ts) that shells out to the `claude` CLI already
 * logged in on this computer. No API key, no separate billing — but the
 * endpoint only exists while running `npm run dev` on this machine. On the
 * deployed static site it 404s, which the catch below turns into a clear
 * message rather than a confusing raw fetch failure.
 */
export async function generateFromJournalLocal(
  journalText: string,
  currentPortrait: string | null,
): Promise<ReflectionResult> {
  let res: Response;
  try {
    res = await fetch('/api/reflect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ journalText, currentPortrait }),
    });
  } catch {
    throw new Error(
      "Couldn't reach local generation. This only works while running the app locally with npm run dev.",
    );
  }

  if (!res.ok) {
    let message = `Local generation failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body (e.g. a 404 from a static host) — keep the default message.
    }
    throw new Error(message);
  }

  return (await res.json()) as ReflectionResult;
}
