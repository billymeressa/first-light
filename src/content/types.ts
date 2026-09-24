export type Theme = 'confidence' | 'calm' | 'health' | 'relationships' | 'growth';

export const THEMES: { id: Theme; label: string; hue: number }[] = [
  { id: 'confidence', label: 'Confidence', hue: 28 },
  { id: 'calm', label: 'Calm', hue: 210 },
  { id: 'health', label: 'Health', hue: 152 },
  { id: 'relationships', label: 'Relationships', hue: 340 },
  { id: 'growth', label: 'Growth', hue: 268 },
];

export interface Entry {
  id: string;
  theme: Theme;
  /** First person, present tense. The line that gets spoken aloud. */
  affirmation: string;
  /** True for entries the user wrote themselves. */
  custom?: boolean;
  /** Present when this entry was generated from a journal reflection. */
  source?: 'journal';
}
