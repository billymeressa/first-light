import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleAnalyze, ApiError } from './api/_lib/analyze';

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
 * Dev-server mirror of api/analyze.ts (the Vercel serverless function), so
 * `npm run dev` exercises the exact same server-side handler — including the
 * Claude/Gemini keys and the sign-in check — without needing `vercel dev`.
 * `loadEnv` is required here because these keys are deliberately NOT
 * VITE_-prefixed (that prefix means "safe to ship to the browser," which
 * these are not); Vite only auto-loads prefixed vars into `process.env`.
 */
function apiPlugin(env) {
  return {
    name: 'first-light-api',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const body = await readJsonBody(req);
          const auth = req.headers.authorization ?? '';

          const result = await handleAnalyze({
            accessToken: auth.startsWith('Bearer ') ? auth.slice(7) : null,
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
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiPlugin(loadEnv(mode, process.cwd(), ''))],
  server: { port: 5178 },
}));
