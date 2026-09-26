import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, bearerToken } from './_lib/auth.js';
import { handleAnalyze } from './_lib/analyze.js';

/**
 * Vercel deploys everything under /api as a serverless function automatically.
 * Untyped against @vercel/node on purpose (no extra dependency for it): this
 * file isn't part of the `src` TypeScript project either, same as
 * vite.config.ts, and Vercel's Node runtime accepts plain
 * (IncomingMessage, ServerResponse) handlers.
 */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  try {
    const body = (req.body ?? {}) as { entryText?: unknown; lensId?: unknown };

    const result = await handleAnalyze({
      accessToken: bearerToken(req.headers.authorization),
      entryText: typeof body.entryText === 'string' ? body.entryText : '',
      lensId: typeof body.lensId === 'string' ? body.lensId : '',
    });

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (err) {
    res.statusCode = err instanceof ApiError ? err.status : 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Analysis failed.' }));
  }
}
