import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { SYSTEM_PROMPT, JSON_SHAPE_INSTRUCTIONS, buildUserContent } from './src/ai/prompt';

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

/** Models sometimes wrap JSON in a ```json fence despite instructions not to. */
function stripCodeFence(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// Tools the CLI shouldn't reach for on a pure text-generation call — this keeps
// it fast and side-effect-free, and avoids ever blocking on a permission prompt
// that has nothing to answer it non-interactively.
const DISALLOWED_TOOLS =
  'Bash,Read,Write,Edit,NotebookEdit,Glob,Grep,WebFetch,WebSearch,Task,TodoWrite,ExitPlanMode,AskUserQuestion';

/**
 * Dev-server-only endpoint: POST /api/reflect shells out to the `claude` CLI
 * already logged in on this machine, so Journal reflection works without an
 * Anthropic API key. Only exists under `vite dev` — the deployed static build
 * has no server behind it, so this is a local-machine-only capability by
 * construction, not an oversight. See src/ai/local.ts for the browser side.
 */
function reflectPlugin() {
  return {
    name: 'first-light-reflect',
    configureServer(server) {
      server.middlewares.use('/api/reflect', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const body = await readJsonBody(req);
          const journalText = typeof body.journalText === 'string' ? body.journalText : '';
          const currentPortrait =
            typeof body.currentPortrait === 'string' ? body.currentPortrait : null;

          if (!journalText.trim()) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'journalText is required' }));
            return;
          }

          const prompt = buildUserContent(journalText, currentPortrait);
          const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${JSON_SHAPE_INSTRUCTIONS}`;

          const stdout = await new Promise((resolve, reject) => {
            execFile(
              'claude',
              [
                '-p',
                prompt,
                '--output-format',
                'json',
                '--system-prompt',
                fullSystemPrompt,
                '--disallowedTools',
                DISALLOWED_TOOLS,
              ],
              // A fresh, project-less cwd — running from the app's own repo
              // would pull its CLAUDE.md and source tree into context for a
              // task that has nothing to do with either.
              { cwd: tmpdir(), timeout: 180_000, maxBuffer: 10 * 1024 * 1024 },
              (err, stdoutData, stderrData) => {
                if (err && err.killed) {
                  reject(new Error('claude CLI timed out after 3 minutes. Try again, or switch to API key mode in Settings.'));
                } else if (err) {
                  reject(new Error(stderrData || err.message));
                } else {
                  resolve(stdoutData);
                }
              },
            );
          });

          const envelope = JSON.parse(stdout);
          if (envelope.is_error) {
            throw new Error(
              typeof envelope.result === 'string'
                ? envelope.result
                : 'The claude CLI reported an error.',
            );
          }

          const parsed = JSON.parse(stripCodeFence(envelope.result));

          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(parsed));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Local generation failed.',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), reflectPlugin()],
  server: { port: 5178 },
});
