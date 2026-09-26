import { dispenzaLens } from './dispenza';
import type { AuthorLens } from './types';

export type { AuthorLens } from './types';

/** Every lens the app knows about. Adding a thinker = one file + one entry
 * here; nothing in the analysis pipeline or the UI needs to change. */
export const LENSES: AuthorLens[] = [dispenzaLens];

export const DEFAULT_LENS_ID = dispenzaLens.id;

export function getLens(id: string): AuthorLens | undefined {
  return LENSES.find((l) => l.id === id);
}
