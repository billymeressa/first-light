import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReflectError, handleReflect } from './_lib/reflect';

/**
 * Vercel deploys everything under /api as a serverless function automatically
 * — no extra config. Untyped against @vercel/node on purpose (no new
 * dependency for it): this file isn't part of the `src` TypeScript project
 * either, same as vite.config.ts, and Vercel's Node runtime accepts plain
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
    const body = (req.body ?? {}) as {
      journalText?: unknown;
      currentPortrait?: unknown;
    };
    const authHeader = req.headers.authorization ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const result = await handleReflect({
      accessToken,
      journalText: typeof body.journalText === 'string' ? body.journalText : '',
      currentPortrait: typeof body.currentPortrait === 'string' ? body.currentPortrait : null,
    });

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (err) {
    const status = err instanceof ReflectError ? err.status : 500;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Reflection failed.' }),
    );
  }
}
