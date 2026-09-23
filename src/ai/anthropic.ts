import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, THEME_IDS, buildUserContent, type ReflectionResult } from './prompt';

/**
 * Turns a journal reflection into new affirmations and an updated
 * "person I want to be" portrait, in the app's existing voice.
 *
 * Calls the Claude API directly from the browser with a key the user
 * supplies and stores themselves — there is no backend. That means the
 * journal text you're reflecting on leaves the device on every call, and
 * the key lives in this browser's localStorage. See Settings for the
 * explanation shown to the user before they add a key.
 *
 * This is the "API key" generation mode. See ai/local.ts for the
 * machine-local alternative that shells out to the `claude` CLI instead.
 */

const MODEL = 'claude-opus-4-8';

export type { GeneratedEntry, ReflectionResult } from './prompt';

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
          theme: { type: 'string', enum: THEME_IDS as unknown as string[] },
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

export async function generateFromJournal(opts: GenerateOptions): Promise<ReflectionResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent(opts.journalText, opts.currentPortrait) }],
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
