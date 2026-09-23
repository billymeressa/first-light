import { SYSTEM_PROMPT, THEME_IDS, buildUserContent, type ReflectionResult } from './prompt';

/**
 * The Gemini alternative to anthropic.ts — same shared prompt, same
 * ReflectionResult shape, different provider. Calls Google's Generative
 * Language API directly from the browser with a key the user supplies.
 *
 * Implemented as a plain fetch against the REST endpoint rather than the
 * @google/genai SDK: the exact request/response shape here (uppercase
 * Schema types, systemInstruction, generationConfig.responseSchema) was
 * confirmed against the live API before writing this, since the SDK's own
 * docs were unreliable when checked. Google's endpoint sends CORS headers
 * permitting direct browser calls — confirmed with a real fetch() from this
 * app's own origin, not just curl.
 */

const MODEL = 'gemini-2.5-flash';

export interface GenerateOptions {
  journalText: string;
  currentPortrait: string | null;
  apiKey: string;
}

/** Google's Schema object: an OpenAPI-3.0 subset with UPPERCASE type names —
 * not standard JSON Schema, despite looking similar. */
const RESPONSE_SCHEMA = {
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
          scene: { type: 'ARRAY', items: { type: 'STRING' } },
          seal: { type: 'STRING' },
        },
        required: ['theme', 'affirmation', 'scene', 'seal'],
      },
    },
  },
  required: ['portrait', 'entries'],
};

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

export async function generateFromJournalGemini(opts: GenerateOptions): Promise<ReflectionResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: buildUserContent(opts.journalText, opts.currentPortrait) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    throw new Error('Could not reach Gemini. Check your connection and try again.');
  }

  if (!res.ok) {
    let body: GeminiErrorBody = {};
    try {
      body = (await res.json()) as GeminiErrorBody;
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }
    throw new Error(describeGeminiHttpError(res.status, body));
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no text to parse.');
  }

  return JSON.parse(text) as ReflectionResult;
}

function describeGeminiHttpError(status: number, body: GeminiErrorBody): string {
  const reason = body.error?.message;
  if (status === 400 && reason?.toLowerCase().includes('api key')) {
    return 'That API key was rejected. Check it in Settings — Gemini keys start with "AIza".';
  }
  if (status === 403) {
    return "That key doesn't have access to the Gemini API. Check it in Settings.";
  }
  if (status === 429) {
    return "You've hit a rate limit — wait a moment and try again.";
  }
  if (status >= 500) {
    return 'Gemini is temporarily unavailable. Try again shortly.';
  }
  return reason ? `Generation failed: ${reason}` : `Generation failed (${status}).`;
}
