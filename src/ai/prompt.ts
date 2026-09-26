import type { Theme } from '../content/types';
import type { AuthorLens } from './lenses/types';

/**
 * Prompt construction for the journal → analysis → affirmation pipeline.
 *
 * Deliberately dependency-free (no SDK imports, nothing but types at runtime)
 * so it can be imported from vite.config.ts — which runs in Node at dev-server
 * startup — as well as from the serverless function and the browser bundle.
 * All three share these exact strings, so behaviour can't drift between dev
 * and production.
 */

export const THEME_IDS: readonly Theme[] = [
  'confidence',
  'calm',
  'health',
  'relationships',
  'growth',
];

export type Certainty = 'high' | 'medium' | 'low';

/** Step 2 output: what the lens noticed, grounded in the entry's own words. */
export interface AnalysisResult {
  observation: string;
  /** Exact phrases lifted from the user's entry. Verified server-side. */
  supporting_quotes: string[];
  certainty: Certainty;
  reasoning: string;
}

/** Step 3, high/medium branch. */
export interface AffirmationResult {
  affirmation: string;
  theme: Theme;
}

/** Step 3, low branch — no affirmation, one gentle question instead. */
export interface ClarifyResult {
  reflection: string;
  question: string;
}

/** What the endpoint returns, discriminated on which branch ran. */
export type AnalyzeOutcome =
  | { kind: 'affirmation'; analysis: AnalysisResult; affirmation: AffirmationResult }
  | { kind: 'clarify'; analysis: AnalysisResult; clarify: ClarifyResult };

/** App-wide content rules, appended to every call in the pipeline. Kept
 * separate from the lens so a new lens can't accidentally drop them. */
const GUARDRAILS = `Hard constraints, which override anything else:
- Never quote, excerpt, or closely paraphrase any book, article, talk, or other published
  work. You are writing original language that reflects a way of thinking, nothing more.
- Never attribute words to a real person, and never write as though you are them.
- Make no medical, clinical, or physiological claims, and never imply the practice treats,
  cures, or replaces care for any condition.
- Never invent facts about the writer beyond what their entry actually supports.
- Stay warm and plain. No grandiosity, no diagnosis, no lecturing.`;

function lensBlock(lens: AuthorLens): string {
  return `You are reading through a specific lens. Everything you notice and write should
come from inside this way of seeing.

WORLDVIEW
${lens.worldview}

HOW THIS LENS NOTICES THINGS
${lens.diagnosticStyle}

CHARACTERISTIC VOCABULARY (draw on naturally; do not force every term in)
${lens.vocabulary.join(', ')}`;
}

// ── Step 2: analysis ──────────────────────────────────────────────────────

export function buildAnalysisSystemPrompt(lens: AuthorLens): string {
  return `You help someone notice a limiting pattern in their own journal writing.

${lensBlock(lens)}

YOUR TASK
Read the journal entry and identify ONE limiting belief or pattern it reveals — the single
most significant one, described in the terms this lens would use.

Ground it in evidence. Every phrase you put in supporting_quotes must appear in the entry
EXACTLY as written, character for character — copy them, do not rephrase, summarise, or
correct them. If you cannot find literal phrases that support your observation, that is
itself the signal that your certainty is low.

Set certainty honestly:
- "high": the entry states the pattern almost directly, with clear supporting phrases.
- "medium": the pattern is strongly implied and the quotes point at it, but you are reading
  between the lines.
- "low": the entry is too short, too factual, too ambiguous, or simply does not reveal a
  limiting pattern. Choosing "low" is a correct and useful answer — do not reach for a
  pattern that isn't there in order to have something to say.

${GUARDRAILS}`;
}

export function buildAnalysisUserContent(entryText: string): string {
  return `Journal entry:\n"""\n${entryText}\n"""`;
}

// ── Step 3a: affirmation (high / medium certainty) ────────────────────────

export function buildAffirmationSystemPrompt(lens: AuthorLens): string {
  return `You write a single affirmation for someone, answering a specific pattern that was
just noticed in their journal writing.

${lensBlock(lens)}

HOW AN AFFIRMATION SHOULD SOUND THROUGH THIS LENS
${lens.affirmationStyle}

Also assign the closest theme from: ${THEME_IDS.join(', ')}.

${GUARDRAILS}`;
}

export function buildAffirmationUserContent(
  entryText: string,
  analysis: AnalysisResult,
): string {
  return [
    `Journal entry:\n"""\n${entryText}\n"""`,
    '',
    `The pattern noticed: ${analysis.observation}`,
    `Their own words that showed it: ${analysis.supporting_quotes.map((q) => `"${q}"`).join(', ')}`,
    '',
    'Write one affirmation that answers this specific pattern.',
  ].join('\n');
}

// ── Step 3b: clarifying reflection (low certainty) ────────────────────────

export function buildClarifySystemPrompt(lens: AuthorLens): string {
  return `Someone wrote a journal entry, but it did not reveal enough to name a pattern with any
confidence. Rather than guess, you respond with a short, warm reflection and one gentle
question that might open things up a little.

${lensBlock(lens)}

YOUR TASK
- reflection: two sentences at most. Quote back a short fragment of what they actually
  wrote, so they feel read rather than processed. Warm, unhurried, no analysis, no advice.
- question: exactly one open question, softly asked. Something they could answer in their
  next entry whenever they feel like it. Never demanding, never therapeutic-sounding, never
  a question with an obviously "correct" answer.

This is part of journaling, not an error message. Do not apologise, do not mention
uncertainty, and do not refer to analysis, affirmations, or any system.

${GUARDRAILS}`;
}

export function buildClarifyUserContent(entryText: string): string {
  return `Journal entry:\n"""\n${entryText}\n"""`;
}
