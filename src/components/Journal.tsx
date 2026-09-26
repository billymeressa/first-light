import { useState } from 'react';
import { THEMES, type Theme } from '../content/types';
import {
  addAnalysis,
  addCustomEntry,
  addJournalEntry,
  addPendingReflection,
  addProposedAffirmation,
  deleteJournalEntry,
  resolveAffirmation,
  resolvePendingReflection,
  useStore,
} from '../state/store';
import { logAffirmationFeedback } from '../state/feedback';
import { analyzeEntry, type AnalyzeOutcome } from '../ai/analysis';
import { DEFAULT_LENS_ID, LENSES, getLens } from '../ai/lenses';

type Tab = 'entries' | 'questions' | 'portrait';

/** A returned outcome held in memory while the user decides what to do with
 * it. Nothing here is persisted until they act — a proposal is not a fact. */
interface Review {
  journalId: string;
  entryText: string;
  lensId: string;
  outcome: AnalyzeOutcome;
  /** The row this proposal was stored as — held explicitly so resolving it
   * can't pick up a different pending proposal by accident. */
  affirmationId?: string;
}

export function Journal() {
  const state = useStore();
  const [tab, setTab] = useState<Tab>('entries');
  const [draft, setDraft] = useState('');
  const [lensId, setLensId] = useState(DEFAULT_LENS_ID);

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  // Keyed to the entry it came from and rendered on that entry's card — a
  // message floating at the top is easy to miss when you're looking further
  // down a long list.
  const [error, setError] = useState<{ entryId: string; message: string } | null>(null);

  const [review, setReview] = useState<Review | null>(null);
  const [editedText, setEditedText] = useState('');
  const [editedTheme, setEditedTheme] = useState<Theme>('growth');

  const currentPortrait = state.portraitHistory.at(-1)?.text ?? null;
  const journal = [...state.journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openQuestions = state.pendingReflections.filter((r) => !r.resolved);

  const saveEntry = () => {
    if (!draft.trim()) return;
    addJournalEntry(draft.trim());
    setDraft('');
  };

  const analyze = async (journalId: string, text: string) => {
    setError(null);
    setAnalyzingId(journalId);
    try {
      const outcome = await analyzeEntry(text, lensId);

      // Persist the analysis either way — it's the record of what was noticed,
      // independent of whether it was confident enough to act on.
      const analysisId = addAnalysis({
        journalId,
        lensId,
        observation: outcome.analysis.observation,
        supportingQuotes: outcome.analysis.supporting_quotes,
        certainty: outcome.analysis.certainty,
        reasoning: outcome.analysis.reasoning,
      });

      if (outcome.kind === 'clarify') {
        // Low certainty: no affirmation, just a question waiting whenever
        // they want it. Deliberately doesn't interrupt what they're doing.
        addPendingReflection({
          journalId,
          lensId,
          reflection: outcome.clarify.reflection,
          question: outcome.clarify.question,
        });
        setReview({ journalId, entryText: text, lensId, outcome });
        return;
      }

      const affirmationId = addProposedAffirmation(analysisId, outcome.affirmation.affirmation);
      setEditedText(outcome.affirmation.affirmation);
      setEditedTheme(outcome.affirmation.theme);
      setReview({ journalId, entryText: text, lensId, outcome, affirmationId });
    } catch (err) {
      setError({
        entryId: journalId,
        message: err instanceof Error ? err.message : 'Analysis failed.',
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  // ── Review screen ─────────────────────────────────────────────────────
  if (review) {
    const lens = getLens(review.lensId);
    const { analysis } = review.outcome;
    // Narrowed here rather than inline: TypeScript won't carry the union
    // narrowing from a JSX ternary into an event handler's closure.
    const proposedText =
      review.outcome.kind === 'affirmation' ? review.outcome.affirmation.affirmation : null;

    const close = () => {
      setReview(null);
      setEditedText('');
    };

    const act = (action: 'confirmed' | 'edited' | 'rejected') => {
      if (review.outcome.kind !== 'affirmation' || !review.affirmationId) return;
      const original = review.outcome.affirmation.affirmation;
      const finalText = editedText.trim();

      let entryId: string | undefined;
      if (action !== 'rejected' && finalText) {
        entryId = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        addCustomEntry({
          id: entryId,
          theme: editedTheme,
          affirmation: finalText,
          custom: true,
          source: 'journal',
        });
      }

      resolveAffirmation(review.affirmationId, action, {
        ...(action === 'edited' ? { editedText: finalText } : {}),
        ...(entryId ? { entryId } : {}),
      });

      logAffirmationFeedback({
        lensId: review.lensId,
        observation: analysis.observation,
        certainty: analysis.certainty,
        affirmationText: original,
        action,
        ...(action === 'edited' ? { editedText: finalText } : {}),
      });

      close();
    };

    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          {review.outcome.kind === 'affirmation' ? 'What came up' : 'A question back'}
        </h1>

        {lens && (
          <p className="faint" style={{ fontSize: '0.78rem', lineHeight: 1.6, marginTop: '0.4rem' }}>
            Through the {lens.name} lens · {lens.attribution}
          </p>
        )}

        {review.outcome.kind === 'affirmation' ? (
          <>
            <div className="section">
              <h2>The pattern</h2>
              <p className="prose" style={{ marginBottom: '1rem' }}>
                {analysis.observation}
              </p>

              {analysis.supporting_quotes.length > 0 && (
                <>
                  <p className="faint" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                    From your own words
                  </p>
                  {analysis.supporting_quotes.map((q, i) => (
                    <p key={i} className="quote-line">
                      “{q}”
                    </p>
                  ))}
                </>
              )}

              <p className="note" style={{ marginTop: '1rem' }}>
                <b>{analysis.certainty === 'high' ? 'Fairly confident' : 'A tentative read'}</b> —{' '}
                {analysis.reasoning} This is a suggestion about you, not a conclusion. Nothing is
                saved until you choose.
              </p>
            </div>

            <div className="section">
              <h2>An affirmation for it</h2>
              <div className="editor" style={{ paddingTop: '0.5rem' }}>
                <label>
                  Edit it into your own words if it isn't quite right
                  <textarea
                    rows={3}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                  />
                </label>
                <label>
                  Theme
                  <select
                    value={editedTheme}
                    onChange={(e) => setEditedTheme(e.target.value as Theme)}
                  >
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="row-control sticky-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                className="btn btn-primary"
                disabled={!editedText.trim()}
                onClick={() => act(editedText.trim() === proposedText ? 'confirmed' : 'edited')}
              >
                Keep it
              </button>
              <button className="btn-quiet" onClick={() => act('rejected')}>
                Not me
              </button>
              <button className="btn-quiet" onClick={close}>
                Decide later
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="prose" style={{ margin: '1.5rem 0' }}>
              {review.outcome.clarify.reflection}
            </p>
            <p className="affirmation" style={{ fontSize: '1.25rem' }}>
              {review.outcome.clarify.question}
            </p>
            <p className="note" style={{ marginTop: '1.5rem' }}>
              No rush — this is waiting for you under <b>Questions</b> whenever you feel like
              answering it.
            </p>
            <div className="row-control" style={{ justifyContent: 'flex-start', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={close}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Tabs ───────────────────────────────────────────────────────────────
  return (
    <div className="rise">
      <div className="chips" style={{ marginBottom: '1.5rem' }}>
        <button className="chip" aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>
          Entries
        </button>
        <button
          className="chip"
          aria-pressed={tab === 'questions'}
          onClick={() => setTab('questions')}
        >
          Questions{openQuestions.length ? ` · ${openQuestions.length}` : ''}
        </button>
        <button className="chip" aria-pressed={tab === 'portrait'} onClick={() => setTab('portrait')}>
          Person I want to be
        </button>
      </div>

      {tab === 'entries' && (
        <>
          <div className="editor" style={{ paddingTop: 0 }}>
            <label>
              What's on your mind
              <textarea
                rows={5}
                value={draft}
                placeholder="Write however it comes out…"
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button
              className="btn btn-ghost"
              onClick={saveEntry}
              disabled={!draft.trim()}
              style={{ alignSelf: 'flex-start' }}
            >
              Save entry
            </button>
          </div>

          {LENSES.length > 1 && (
            <div style={{ marginTop: '1.25rem' }}>
              <p className="faint" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                Read through
              </p>
              <div className="chips">
                {LENSES.map((l) => (
                  <button
                    key={l.id}
                    className="chip"
                    aria-pressed={lensId === l.id}
                    onClick={() => setLensId(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {journal.length === 0 ? (
            <p className="faint" style={{ fontSize: '0.85rem', marginTop: '1.5rem' }}>
              Nothing here yet.
            </p>
          ) : (
            <div style={{ marginTop: '1.5rem' }}>
              {journal.map((entry) => (
                <div key={entry.id} className="entry-card">
                  <p className="line">{entry.text}</p>
                  <div className="entry-head" style={{ marginTop: '0.6rem' }}>
                    <p className="entry-meta">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {entry.generatedEntryIds?.length
                        ? ` · ${entry.generatedEntryIds.length} kept`
                        : ''}
                    </p>
                    <div className="row-control">
                      <button
                        className="btn-quiet"
                        onClick={() => void analyze(entry.id, entry.text)}
                        disabled={analyzingId === entry.id}
                      >
                        {analyzingId === entry.id ? 'Reading…' : 'Read it'}
                      </button>
                      <button className="btn-quiet" onClick={() => deleteJournalEntry(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  {error?.entryId === entry.id && (
                    <p className="note" style={{ marginTop: '0.75rem' }}>
                      {error.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'questions' && (
        <>
          <p className="faint" style={{ fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            When an entry doesn't say enough to draw anything from, you get a question instead of
            a guess. Answer them whenever you like — in a new entry, or not at all.
          </p>

          {openQuestions.length === 0 ? (
            <p className="faint" style={{ fontSize: '0.85rem' }}>
              Nothing waiting.
            </p>
          ) : (
            openQuestions
              .slice()
              .reverse()
              .map((r) => (
                <div key={r.id} className="entry-card">
                  <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {r.reflection}
                  </p>
                  <p className="line" style={{ marginTop: '0.75rem' }}>
                    {r.question}
                  </p>
                  <div className="entry-head" style={{ marginTop: '0.6rem' }}>
                    <p className="entry-meta">
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {getLens(r.lensId) ? ` · ${getLens(r.lensId)!.name}` : ''}
                    </p>
                    <button className="btn-quiet" onClick={() => resolvePendingReflection(r.id)}>
                      Done with it
                    </button>
                  </div>
                </div>
              ))
          )}
        </>
      )}

      {tab === 'portrait' && (
        <>
          {currentPortrait ? (
            <p className="prose rise" style={{ marginBottom: '2rem', whiteSpace: 'pre-wrap' }}>
              {currentPortrait}
            </p>
          ) : (
            <p className="faint" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              Nothing here yet.
            </p>
          )}

          {state.portraitHistory.length > 1 && (
            <div className="history-list">
              <h2 className="eyebrow" style={{ marginBottom: '0.5rem' }}>
                Earlier versions
              </h2>
              {[...state.portraitHistory]
                .slice(0, -1)
                .reverse()
                .map((v) => (
                  <div className="history-item" key={v.date} style={{ alignItems: 'flex-start' }}>
                    <time dateTime={v.date}>
                      {new Date(v.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    <span className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                      {v.text}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
