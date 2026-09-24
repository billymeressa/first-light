import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleReflect, ReflectError } from './api/_lib/reflect';

/** Reads and JSON-parses a connect middleware request body. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Dev-server mirror of api/reflect.ts (the Vercel serverless function), so
 * `npm run dev` exercises the exact same server-side handler — including the
 * Claude/Gemini keys and the sign-in check — without needing `vercel dev`.
 * `loadEnv` is required here because these keys are deliberately NOT
 * VITE_-prefixed (that prefix means "safe to ship to the browser," which
 * these are not); Vite only auto-loads prefixed vars into `process.env`.
 */
function reflectPlugin(env) {
  return {
    name: 'first-light-reflect',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use('/api/reflect', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const body = await readJsonBody(req);
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
          res.statusCode = err instanceof ReflectError ? err.status : 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Reflection failed.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), reflectPlugin(loadEnv(mode, process.cwd(), ''))],
  server: { port: 5178 },
}));
