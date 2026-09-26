/**
 * An "author lens" — the worldview the AI reads a journal entry through.
 *
 * Deliberately plain config, not prompt strings with logic baked in: adding a
 * second thinker should mean writing one more object in this folder and
 * registering it, with no change to the pipeline in api/_lib/analyze.ts.
 *
 * IMPORTANT, and the reason every field below says "in your own words": these
 * describe publicly-known *ideas* associated with a real, living person. They
 * must never contain excerpts, close paraphrases of specific passages, or
 * invented quotations. The UI presents output as shaped-by, never as written
 * by or spoken by the author — see `attribution`.
 */
export interface AuthorLens {
  id: string;
  /** Short label for the UI, e.g. "Dispenza". */
  name: string;
  /** One line under the name that keeps the framing honest for the user. */
  attribution: string;
  /** The core way this lens sees a person and their patterns. */
  worldview: string;
  /** How it goes about noticing what's limiting someone — its diagnostic move. */
  diagnosticStyle: string;
  /** Words and phrases characteristic of the framework, for the model to draw on. */
  vocabulary: string[];
  /** How an affirmation should sound once written through this lens. */
  affirmationStyle: string;
}
