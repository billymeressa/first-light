import { useState } from 'react';
import { THEMES, type Theme } from '../content/types';
import {
  addCustomEntry,
  addJournalEntry,
  addPortraitVersion,
  deleteJournalEntry,
  recordReflection,
  useStore,
} from '../state/store';
import { describeGenerationError, generateFromJournal, type GeneratedEntry } from '../ai/anthropic';
import { generateFromJournalLocal } from '../ai/local';

type Tab = 'entries' | 'portrait';

interface Suggestion extends GeneratedEntry {
  keep: boolean;
}

function toSuggestion(e: GeneratedEntry): Suggestion {
  return { ...e, keep: true };
}

export function Journal() {
  const state = useStore();
  const [tab, setTab] = useState<Tab>('entries');
  const [draft, setDraft] = useState('');

  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [reflectError, setReflectError] = useState<string | null>(null);

  const [reviewJournalId, setReviewJournalId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [portraitDraft, setPortraitDraft] = useState('');

  const currentPortrait = state.portraitHistory.at(-1)?.text ?? null;
  const journal = [...state.journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const saveEntry = () => {
    if (!draft.trim()) return;
    addJournalEntry(draft.trim());
    setDraft('');
  };

  const reflect = async (journalId: string, text: string) => {
    if (state.generationMode === 'api' && !state.apiKey) {
      setReflectError('Add an API key in Settings → AI generation before reflecting.');
      return;
    }
    setReflectError(null);
    setReflectingId(journalId);
    try {
      const result =
        state.generationMode === 'local'
          ? await generateFromJournalLocal(text, currentPortrait)
          : await generateFromJournal({ journalText: text, currentPortrait, apiKey: state.apiKey! });
      setSuggestions(result.entries.map(toSuggestion));
      setPortraitDraft(result.portrait);
      setReviewJournalId(journalId);
    } catch (err) {
      setReflectError(
        state.generationMode === 'local'
          ? err instanceof Error
            ? err.message
            : 'Local generation failed.'
          : describeGenerationError(err),
      );
    } finally {
      setReflectingId(null);
    }
  };

  const updateSuggestion = (i: number, patch: Partial<Suggestion>) => {
    setSuggestions((all) => all.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const saveReflection = () => {
    if (!reviewJournalId || !portraitDraft.trim()) return;
    const newIds: string[] = [];
    for (const s of suggestions) {
      if (!s.keep) continue;
      if (!s.affirmation.trim() || s.scene.every((l) => !l.trim())) continue;
      const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      addCustomEntry({
        id,
        theme: s.theme,
        affirmation: s.affirmation.trim(),
        scene: s.scene.map((l) => l.trim()).filter(Boolean),
        seal: s.seal.trim() || 'The feeling of this already being true.',
        custom: true,
        source: 'journal',
      });
      newIds.push(id);
    }
    recordReflection(reviewJournalId, newIds);
    addPortraitVersion(portraitDraft.trim());
    setReviewJournalId(null);
    setSuggestions([]);
    setPortraitDraft('');
  };

  // ── Review screen ─────────────────────────────────────────────────────
  if (reviewJournalId) {
    const sourceEntry = state.journal.find((e) => e.id === reviewJournalId);
    const keptCount = suggestions.filter((s) => s.keep).length;

    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Review
        </h1>

        {sourceEntry && (
          <p className="faint" style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            From: "{sourceEntry.text.slice(0, 140)}
            {sourceEntry.text.length > 140 ? '…' : ''}"
          </p>
        )}

        <div className="section">
          <h2>Person I want to be — updated</h2>
          <textarea
            rows={6}
            value={portraitDraft}
            onChange={(e) => setPortraitDraft(e.target.value)}
          />
        </div>

        <div className="section">
          <h2>New affirmations — keep, edit, or discard</h2>
          {suggestions.map((s, i) => (
            <div key={i} className="editor" style={{ borderTop: '1px solid var(--line)', paddingTop: '1.25rem' }}>
              <div className="row-control" style={{ justifyContent: 'space-between' }}>
                <select
                  value={s.theme}
                  onChange={(e) => updateSuggestion(i, { theme: e.target.value as Theme })}
                >
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  className="chip"
                  aria-pressed={s.keep}
                  onClick={() => updateSuggestion(i, { keep: !s.keep })}
                >
                  {s.keep ? 'Keeping' : 'Discarded'}
                </button>
              </div>

              <label>
                Affirmation
                <textarea
                  rows={2}
                  value={s.affirmation}
                  onChange={(e) => updateSuggestion(i, { affirmation: e.target.value })}
                />
              </label>

              <label>
                Scene — one moment per line
                <textarea
                  rows={5}
                  value={s.scene.join('\n')}
                  onChange={(e) => updateSuggestion(i, { scene: e.target.value.split('\n') })}
                />
              </label>

              <label>
                The feeling to close on
                <textarea
                  rows={2}
                  value={s.seal}
                  onChange={(e) => updateSuggestion(i, { seal: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="row-control" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn btn-primary"
            onClick={saveReflection}
            disabled={!portraitDraft.trim()}
          >
            Save {keptCount > 0 ? `(${keptCount} affirmation${keptCount === 1 ? '' : 's'})` : ''}
          </button>
          <button
            className="btn-quiet"
            onClick={() => {
              setReviewJournalId(null);
              setSuggestions([]);
              setPortraitDraft('');
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Entries / Portrait tabs ─────────────────────────────────────────────
  return (
    <div className="rise">
      <div className="page-head">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Journal
        </h1>
      </div>

      <div className="chips" style={{ marginBottom: '1.5rem' }}>
        <button className="chip" aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>
          Entries
        </button>
        <button className="chip" aria-pressed={tab === 'portrait'} onClick={() => setTab('portrait')}>
          Person I want to be
        </button>
      </div>

      {tab === 'entries' ? (
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
            <button className="btn btn-ghost" onClick={saveEntry} disabled={!draft.trim()} style={{ alignSelf: 'flex-start' }}>
              Save entry
            </button>
          </div>

          {reflectError && (
            <p className="note" style={{ margin: '1.25rem 0' }}>
              {reflectError}
            </p>
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
                        onClick={() => void reflect(entry.id, entry.text)}
                        disabled={reflectingId === entry.id}
                      >
                        {reflectingId === entry.id ? 'Reflecting…' : 'Reflect'}
                      </button>
                      <button className="btn-quiet" onClick={() => deleteJournalEntry(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {currentPortrait ? (
            <p className="scene-line rise" style={{ marginBottom: '2rem', whiteSpace: 'pre-wrap' }}>
              {currentPortrait}
            </p>
          ) : (
            <p className="faint" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              Nothing here yet. Write a journal entry and reflect on it to begin.
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
