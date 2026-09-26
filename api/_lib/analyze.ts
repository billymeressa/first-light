import Anthropic from '@anthropic-ai/sdk';
import { ApiError, verifyUser } from './auth.js';
import { getLens } from '../../src/ai/lenses/index.js';
import {
  THEME_IDS,
  buildAffirmationSystemPrompt,
  buildAffirmationUserContent,
  buildAnalysisSystemPrompt,
  buildAnalysisUserContent,
  buildClarifySystemPrompt,
  buildClarifyUserContent,
  type AffirmationResult,
  type AnalysisResult,
  type AnalyzeOutcome,
  type ClarifyResult,
} from '../../src/ai/prompt.js';

/**
 * Server half of the journal → analysis → affirmation pipeline. Runs as a
 * Vercel serverless function (api/analyze.ts) and as Vite dev middleware
 * (vite.config.ts) from this one module, so dev and production can't drift.
 *
 * Provider keys live only here, as plain (non-VITE_-prefixed) env vars, so
 * they are never bundled into client code.
 */

const ANTHROPIC_MODEL = 'claude-opus-4-8';
const GEMINI_MODEL = 'gemini-2.5-flash';

export { ApiError };

// ── Provider plumbing ─────────────────────────────────────────────────────

/** Anthropic JSON-schema and Google's uppercase-typed Schema describe the same
 * shape in two dialects; each call site supplies both. */
interface SchemaPair {
  anthropic: object;
  gemini: object;
}

async function viaAnthropic<T>(system: string, user: string, schema: object): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text to parse.');
  return JSON.parse(textBlock.text) as T;
}

async function viaGemini<T>(system: string, user: string, schema: object): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    }),
  });

  if (!res.ok) throw new Error(`Gemini request failed (${res.status}).`);

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text to parse.');
  return JSON.parse(text) as T;
}

/** Claude first, Gemini as fallback — resilience against either provider
 * being down, slow, or rate-limited. Mirrors how the app has always called
 * these two. */
async function generate<T>(system: string, user: string, schema: SchemaPair): Promise<T> {
  const haveAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const haveGemini = Boolean(process.env.GEMINI_API_KEY);
  if (!haveAnthropic && !haveGemini) {
    throw new ApiError(500, 'AI generation is not configured on the server.');
  }

  if (haveAnthropic) {
    try {
      return await viaAnthropic<T>(system, user, schema.anthropic);
    } catch (err) {
      if (!haveGemini) throw new ApiError(502, describeUpstreamError(err));
      // Fall through to Gemini.
    }
  }

  try {
    return await viaGemini<T>(system, user, schema.gemini);
  } catch (err) {
    throw new ApiError(502, describeUpstreamError(err));
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
  return 'Something went wrong reading this entry. Try again shortly.';
}

// ── Schemas ───────────────────────────────────────────────────────────────

const ANALYSIS_SCHEMA: SchemaPair = {
  anthropic: {
    type: 'object',
    properties: {
      observation: { type: 'string' },
      supporting_quotes: { type: 'array', items: { type: 'string' } },
      certainty: { type: 'string', enum: ['high', 'medium', 'low'] },
      reasoning: { type: 'string' },
    },
    required: ['observation', 'supporting_quotes', 'certainty', 'reasoning'],
    additionalProperties: false,
  },
  gemini: {
    type: 'OBJECT',
    properties: {
      observation: { type: 'STRING' },
      supporting_quotes: { type: 'ARRAY', items: { type: 'STRING' } },
      certainty: { type: 'STRING', enum: ['high', 'medium', 'low'] },
      reasoning: { type: 'STRING' },
    },
    required: ['observation', 'supporting_quotes', 'certainty', 'reasoning'],
  },
};

const AFFIRMATION_SCHEMA: SchemaPair = {
  anthropic: {
    type: 'object',
    properties: {
      affirmation: { type: 'string' },
      theme: { type: 'string', enum: THEME_IDS as unknown as string[] },
    },
    required: ['affirmation', 'theme'],
    additionalProperties: false,
  },
  gemini: {
    type: 'OBJECT',
    properties: {
      affirmation: { type: 'STRING' },
      theme: { type: 'STRING', enum: THEME_IDS },
    },
    required: ['affirmation', 'theme'],
  },
};

const CLARIFY_SCHEMA: SchemaPair = {
  anthropic: {
    type: 'object',
    properties: {
      reflection: { type: 'string' },
      question: { type: 'string' },
    },
    required: ['reflection', 'question'],
    additionalProperties: false,
  },
  gemini: {
    type: 'OBJECT',
    properties: {
      reflection: { type: 'STRING' },
      question: { type: 'STRING' },
    },
    required: ['reflection', 'question'],
  },
};

// ── Grounding ─────────────────────────────────────────────────────────────

/** Models routinely "helpfully" tidy a quote — smart quotes, collapsed
 * whitespace, different dashes. Comparing on a normalised form catches the
 * real fabrications without rejecting those harmless rewrites. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drops any quote that isn't actually in the entry, and downgrades certainty
 * when nothing survives. The whole point of supporting_quotes is that the
 * observation is anchored in something the user really wrote — an unverified
 * quote is worse than no quote, because it looks like evidence.
 */
function groundAnalysis(analysis: AnalysisResult, entryText: string): AnalysisResult {
  const haystack = normalise(entryText);
  const verified = (analysis.supporting_quotes ?? []).filter((q) => {
    const needle = normalise(q);
    return needle.length > 0 && haystack.includes(needle);
  });

  if (verified.length > 0) {
    return { ...analysis, supporting_quotes: verified };
  }

  // Nothing could be verified: whatever the model claimed, this is a low
  // confidence read, and the clarify branch is the honest response.
  return { ...analysis, supporting_quotes: [], certainty: 'low' };
}

// ── Entry point ───────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  accessToken: string | null;
  entryText: string;
  lensId: string;
}

export async function handleAnalyze(req: AnalyzeRequest): Promise<AnalyzeOutcome> {
  await verifyUser(req.accessToken);

  const entryText = req.entryText?.trim() ?? '';
  if (!entryText) throw new ApiError(400, 'entryText is required.');

  const lens = getLens(req.lensId);
  if (!lens) throw new ApiError(400, `Unknown lens "${req.lensId}".`);

  // Step 2 — analysis, then verify its quotes against the entry.
  const raw = await generate<AnalysisResult>(
    buildAnalysisSystemPrompt(lens),
    buildAnalysisUserContent(entryText),
    ANALYSIS_SCHEMA,
  );
  const analysis = groundAnalysis(raw, entryText);

  // Step 3 — branch on certainty.
  if (analysis.certainty === 'low') {
    const clarify = await generate<ClarifyResult>(
      buildClarifySystemPrompt(lens),
      buildClarifyUserContent(entryText),
      CLARIFY_SCHEMA,
    );
    return { kind: 'clarify', analysis, clarify };
  }

  const affirmation = await generate<AffirmationResult>(
    buildAffirmationSystemPrompt(lens),
    buildAffirmationUserContent(entryText, analysis),
    AFFIRMATION_SCHEMA,
  );
  return { kind: 'affirmation', analysis, affirmation };
}
