import type { Theme } from '../content/types';

/**
 * Shared between the two generation paths — the browser-side Anthropic SDK
 * call (anthropic.ts) and the local Vite dev-server plugin that shells out to
 * the `claude` CLI (see vite.config.ts). Deliberately dependency-free (no SDK
 * import) so it can be imported from vite.config.ts, which runs in Node at
 * dev-server startup, not just from the browser bundle.
 */

export const THEME_IDS: readonly Theme[] = [
  'confidence',
  'calm',
  'health',
  'relationships',
  'growth',
];

export interface GeneratedEntry {
  theme: Theme;
  affirmation: string;
}

export interface ReflectionResult {
  portrait: string;
  entries: GeneratedEntry[];
}

export const SYSTEM_PROMPT = `You write for "First Light," a quiet morning affirmation practice. You are given a
person's private journal reflection and asked to do two things in their established voice.

VOICE — match this exactly, from the app's existing library. First person, present tense, one
short sentence, concrete over abstract:
"I am someone who speaks clearly about what I know."
"I let myself be helped."
"I do not need everyone in the room to agree with me."

TASK, given a journal entry and (if present) the current "person I want to be" portrait:

1. Write exactly 3 new affirmations that respond specifically to what was actually written — not
   generic restatements of the theme. Ground each one in a concrete detail from the entry. Assign
   each a theme from: confidence, calm, health, relationships, growth.
2. Write the portrait forward: 2-4 short paragraphs, first person present tense ("I am becoming
   someone who..."), in the same literary, intimate register as the affirmations. If a portrait
   already exists, evolve it — keep what still holds, revise or extend what the entry adds, don't
   just append. If none exists, write the first version from this entry alone.

Constraints: no medical or clinical claims: this is a personal-growth practice, not treatment.
Nothing about "fixing" the person, only about who they are becoming. Never invent facts about the
person beyond what the entry supports. Keep sentences short and concrete over abstract or grandiose.`;

/**
 * The Messages API enforces this via output_config.format (see anthropic.ts).
 * The `claude` CLI has no equivalent structured-output constraint, so the
 * local path appends this as plain-language instructions instead.
 */
export const JSON_SHAPE_INSTRUCTIONS = `Respond with ONLY a single raw JSON object and nothing else — no markdown code
fences, no leading or trailing commentary, no "Here is the JSON:". Exactly this shape:

{
  "portrait": "<string>",
  "entries": [
    { "theme": "confidence" | "calm" | "health" | "relationships" | "growth", "affirmation": "<string>" },
    ... exactly 3 of these
  ]
}`;

export function buildUserContent(journalText: string, currentPortrait: string | null): string {
  return [
    currentPortrait
      ? `Current "person I want to be" portrait:\n${currentPortrait}`
      : 'There is no portrait yet — this is the first reflection.',
    '',
    `Journal entry:\n${journalText}`,
  ].join('\n');
}
