import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT, THEME_IDS, buildUserContent, type ReflectionResult } from '../../src/ai/prompt';

/**
 * The server-side half of Journal reflection. Runs as a Vercel serverless
 * function in production (api/reflect.ts) and as a Vite dev-server
 * middleware locally (vite.config.ts) — same handler either way, so behavior
 * never drifts between dev and deployed.
 *
 * The Claude/Gemini keys live only here, as plain (non-VITE_-prefixed)
 * environment variables, so they're never bundled into client code. Every
 * call still costs the app owner money, so it's gated on a real signed-in
 * Supabase user — verified against Supabase's auth server using the
 * anon/publishable key, which is enough to validate a token without needing
 * the more sensitive service-role/secret key at all.
 */

const ANTHROPIC_MODEL = 'claude-opus-4-8';
const GEMINI_MODEL = 'gemini-2.5-flash';

export class ReflectError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function verifyUser(accessToken: string | null): Promise<void> {
  if (!accessToken) throw new ReflectError(401, 'Sign in to use Journal reflection.');

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ReflectError(500, 'Cloud sync is not configured on the server.');
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ReflectError(401, 'Your session has expired — sign in again.');
  }
}

const ANTHROPIC_SCHEMA = {
  type: 'object',
  properties: {
    portrait: {
      type: 'string',
      description:
        'The updated "person I want to be" portrait: 2-4 short paragraphs, first person, present tense.',
    },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: THEME_IDS as unknown as string[] },
          affirmation: { type: 'string' },
        },
        required: ['theme', 'affirmation'],
        additionalProperties: false,
      },
    },
  },
  required: ['portrait', 'entries'],
  additionalProperties: false,
} as const;

async function generateViaAnthropic(
  journalText: string,
  currentPortrait: string | null,
): Promise<ReflectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: ANTHROPIC_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent(journalText, currentPortrait) }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text to parse.');
  return JSON.parse(textBlock.text) as ReflectionResult;
}

/** Google's Schema object: an OpenAPI-3.0 subset with UPPERCASE type names. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    portrait: { type: 'STRING' },
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          theme: { type: 'STRING', enum: THEME_IDS },
          affirmation: { type: 'STRING' },
        },
        required: ['theme', 'affirmation'],
      },
    },
  },
  required: ['portrait', 'entries'],
};

async function generateViaGemini(
  journalText: string,
  currentPortrait: string | null,
): Promise<ReflectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildUserContent(journalText, currentPortrait) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
    }),
  });

  if (!res.ok) throw new Error(`Gemini request failed (${res.status}).`);

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text to parse.');
  return JSON.parse(text) as ReflectionResult;
}

export interface ReflectRequest {
  accessToken: string | null;
  journalText: string;
  currentPortrait: string | null;
}

/** Try Claude first, then Gemini — resilience against either provider being
 * down, slow, or rate-limited, per the app's "use both, pick one" setup. */
export async function handleReflect(req: ReflectRequest): Promise<ReflectionResult> {
  await verifyUser(req.accessToken);

  if (!req.journalText.trim()) {
    throw new ReflectError(400, 'journalText is required.');
  }

  const haveAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const haveGemini = Boolean(process.env.GEMINI_API_KEY);
  if (!haveAnthropic && !haveGemini) {
    throw new ReflectError(500, 'AI generation is not configured on the server.');
  }

  if (haveAnthropic) {
    try {
      return await generateViaAnthropic(req.journalText, req.currentPortrait);
    } catch (err) {
      if (!haveGemini) {
        throw new ReflectError(502, describeUpstreamError(err));
      }
      // Fall through to Gemini.
    }
  }

  try {
    return await generateViaGemini(req.journalText, req.currentPortrait);
  } catch (err) {
    throw new ReflectError(502, describeUpstreamError(err));
  }
}

function describeUpstreamError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) {
    return "You've hit a rate limit — wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Generation failed (${err.status ?? 'unknown'}).`;
  }
  if (err instanceof SyntaxError) {
    return "The model's response could not be read. Try again.";
  }
  return 'Something went wrong generating from this entry. Try again shortly.';
}
