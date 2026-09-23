import Anthropic from '@anthropic-ai/sdk';
import type { Theme } from '../content/types';

/**
 * Turns a journal reflection into new affirmations and an updated
 * "person I want to be" portrait, in the app's existing voice.
 *
 * Calls the Claude API directly from the browser with a key the user
 * supplies and stores themselves — there is no backend. That means the
 * journal text you're reflecting on leaves the device on every call, and
 * the key lives in this browser's localStorage. See Settings for the
 * explanation shown to the user before they add a key.
 */

const MODEL = 'claude-opus-4-8';

const THEMES: readonly Theme[] = ['confidence', 'calm', 'health', 'relationships', 'growth'];

export interface GeneratedEntry {
  theme: Theme;
  affirmation: string;
  scene: string[];
  seal: string;
}

export interface ReflectionResult {
  portrait: string;
  entries: GeneratedEntry[];
}

export interface GenerateOptions {
  journalText: string;
  currentPortrait: string | null;
  apiKey: string;
}

const RESPONSE_SCHEMA = {
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
          theme: { type: 'string', enum: THEMES as unknown as string[] },
          affirmation: { type: 'string' },
          scene: { type: 'array', items: { type: 'string' } },
          seal: { type: 'string' },
        },
        required: ['theme', 'affirmation', 'scene', 'seal'],
        additionalProperties: false,
      },
    },
  },
  required: ['portrait', 'entries'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write for "First Light," a quiet morning affirmation practice. You are given a
person's private journal reflection and asked to do two things in their established voice.

VOICE — match this exactly, from the app's existing library:

Affirmation (first person, present tense, one sentence):
"I am someone who speaks clearly about what I know."
"I let myself be helped."

Scene (second person "you", 4-6 short sentences, one concrete sensory beat per line, present tense,
building toward — but not stating — the felt sense):
"A room with more people in it than you expected."
"You are already standing. Your feet are flat and warm on the floor."
"You begin, and your voice comes out at the pace you chose — not faster."
"Someone at the back leans in slightly to hear you better."

Seal (a short noun phrase naming the feeling, not a sentence):
"The steadiness of having said the true thing, plainly."

TASK, given a journal entry and (if present) the current "person I want to be" portrait:

1. Write exactly 3 new affirmation+scene+seal entries that respond specifically to what was actually
   written — not generic restatements of the theme. Ground each one in a concrete detail from the
   entry. Assign each a theme from: confidence, calm, health, relationships, growth.
2. Write the portrait forward: 2-4 short paragraphs, first person present tense ("I am becoming
   someone who..."), in the same literary, intimate register as the affirmations. If a portrait
   already exists, evolve it — keep what still holds, revise or extend what the entry adds, don't
   just append. If none exists, write the first version from this entry alone.

Constraints: no medical or clinical claims: this is a personal-growth practice, not treatment.
Nothing about "fixing" the person, only about who they are becoming. Never invent facts about the
person beyond what the entry supports. Keep sentences short and concrete over abstract or grandiose.`;

export async function generateFromJournal(opts: GenerateOptions): Promise<ReflectionResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  const userContent = [
    opts.currentPortrait
      ? `Current "person I want to be" portrait:\n${opts.currentPortrait}`
      : 'There is no portrait yet — this is the first reflection.',
    '',
    `Journal entry:\n${opts.journalText}`,
  ].join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  if (!textBlock) {
    throw new Error('The model returned no text to parse.');
  }

  const parsed = JSON.parse(textBlock.text) as ReflectionResult;
  return parsed;
}

/** A message safe to show directly in the UI — never the raw error. */
export function describeGenerationError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'That API key was rejected. Check it in Settings.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "You've hit a rate limit — wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach Anthropic. Check your connection and try again.';
  }
  if (err instanceof Anthropic.APIError) {
    return `Generation failed (${err.status ?? 'unknown'}): ${err.message}`;
  }
  if (err instanceof SyntaxError) {
    return 'The model\'s response could not be read. Try again.';
  }
  return 'Something went wrong generating from this entry.';
}
