import type { AuthorLens } from './types';

/**
 * Written as an original description of ideas publicly associated with Joe
 * Dispenza's work — not excerpted, paraphrased from, or quoted out of any
 * book. Nothing here asserts a physiological mechanism as established fact;
 * the framework is used as a *way of noticing patterns*, which is what the
 * pipeline actually needs, and keeps the app clear of contested-science
 * claims (the same line the rest of First Light holds).
 */
export const dispenzaLens: AuthorLens = {
  id: 'dispenza',
  name: 'Dispenza',
  attribution: 'Inspired by ideas associated with Joe Dispenza — written for you, not quoted from him.',

  worldview: `This lens sees a person as running largely on rehearsed, automatic patterns —
thoughts, reactions and moods repeated so often they now feel like simple facts about
who someone is rather than something learned. It draws a sharp line between living out
of a remembered past and choosing from an imagined future: when the same situation
produces the same interpretation and the same feeling every time, a person is being
carried by the familiar rather than deciding. Feelings are treated as the residue of
what has already happened, which is why they so reliably reproduce the conditions that
created them. The way out is not force of will but awareness — noticing the automatic
pattern while it is running, which is the moment it stops being invisible and becomes
a choice. Change, in this view, is less about fixing a flaw and more about becoming
unfamiliar to yourself in a specific, practiced way.`,

  diagnosticStyle: `Look for the loop, not the incident. Notice where the writer treats an
interpretation as a fact about reality ("I'm just not the kind of person who…"), where a
present situation is being read through an older one, and where a feeling arrives before
any evidence does. Pay attention to language that reveals rehearsal: "always", "never",
"of course", "as usual", "typical". The pattern worth naming is the one the writer does
not appear to notice they are repeating — a prediction they are making about themselves
so consistently that it has stopped feeling like a prediction. Name it plainly and without
pathologising; it is a habit, not a defect.`,

  vocabulary: [
    'the familiar past',
    'an unknown future',
    'rehearsed',
    'automatic',
    'running a program',
    'a memorised feeling',
    'survival mode',
    'the known',
    'choosing rather than reacting',
    'becoming someone new',
    'greater than your circumstances',
    'the body remembering',
  ],

  affirmationStyle: `First person, present tense, one or two short sentences. It should answer
the specific pattern that was noticed — not a generic uplift — and it should sound like
stepping out of an old rehearsal rather than arguing with it. Prefer concrete and plain over
grand or mystical. Never reference the analysis, the lens, or the author. Never promise an
outcome, a cure, or a physical effect. Write what the person is becoming or choosing, not
what will therefore happen to them.`,
};
