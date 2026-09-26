import { supabase } from '../lib/supabase';
import type { Certainty } from '../ai/prompt';

/**
 * Logs what the user did with a proposed affirmation to the append-only
 * `affirmation_feedback` table (see supabase/schema.sql).
 *
 * Fire-and-forget on purpose: this is telemetry for later quality review, not
 * part of the user's data. If it fails — offline, RLS, table not created yet —
 * the confirm/edit/reject the user just performed must still succeed, so
 * nothing here is ever awaited by the UI or surfaced as an error.
 */
export interface FeedbackEvent {
  lensId: string;
  observation: string;
  certainty: Certainty;
  affirmationText: string;
  action: 'confirmed' | 'edited' | 'rejected';
  editedText?: string;
}

export function logAffirmationFeedback(event: FeedbackEvent): void {
  if (!supabase) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;

      await supabase.from('affirmation_feedback').insert({
        user_id: userId,
        lens_id: event.lensId,
        observation: event.observation,
        certainty: event.certainty,
        affirmation_text: event.affirmationText,
        action: event.action,
        ...(event.editedText ? { edited_text: event.editedText } : {}),
      });
    } catch {
      // Deliberately silent — see the note above.
    }
  })();
}
