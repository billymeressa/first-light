import { useState } from 'react';
import { THEMES, type Entry, type Theme } from '../content/types';
import {
  addCustomEntry,
  deleteCustomEntry,
  toggleHidden,
  updateCustomEntry,
  useStore,
} from '../state/store';
import { allEntries } from '../state/daily';

const BLANK = {
  theme: 'confidence' as Theme,
  affirmation: '',
  scene: '',
  seal: '',
};

export function Library() {
  const state = useStore();
  const entries = allEntries(state);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...BLANK });
  const [filter, setFilter] = useState<Theme | 'all'>('all');

  const openNew = () => {
    setDraft({ ...BLANK });
    setEditingId('new');
  };

  const openEdit = (entry: Entry) => {
    setDraft({
      theme: entry.theme,
      affirmation: entry.affirmation,
      scene: entry.scene.join('\n'),
      seal: entry.seal,
    });
    setEditingId(entry.id);
  };

  const save = () => {
    const scene = draft.scene
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!draft.affirmation.trim() || !scene.length) return;

    const payload = {
      theme: draft.theme,
      affirmation: draft.affirmation.trim(),
      scene,
      seal: draft.seal.trim() || 'The feeling of this already being true.',
    };

    if (editingId === 'new') {
      addCustomEntry({ id: `u${Date.now().toString(36)}`, custom: true, ...payload });
    } else if (editingId) {
      updateCustomEntry(editingId, payload);
    }
    setEditingId(null);
  };

  const visible = filter === 'all' ? entries : entries.filter((e) => e.theme === filter);
  const canSave = draft.affirmation.trim().length > 0 && draft.scene.trim().length > 0;

  if (editingId) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          {editingId === 'new' ? 'Write your own' : 'Edit'}
        </h1>

        <div className="editor">
          <label>
            Theme
            <select
              value={draft.theme}
              onChange={(e) => setDraft({ ...draft, theme: e.target.value as Theme })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Affirmation — first person, present tense
            <textarea
              rows={2}
              value={draft.affirmation}
              placeholder="I am someone who…"
              onChange={(e) => setDraft({ ...draft, affirmation: e.target.value })}
            />
          </label>

          <label>
            The scene — one moment per line
            <textarea
              rows={7}
              value={draft.scene}
              placeholder={'A room you know well.\nThe light is coming in low.\n…'}
              onChange={(e) => setDraft({ ...draft, scene: e.target.value })}
            />
          </label>

          <label>
            The feeling to close on
            <textarea
              rows={2}
              value={draft.seal}
              placeholder="The steadiness of…"
              onChange={(e) => setDraft({ ...draft, seal: e.target.value })}
            />
          </label>

          <div className="row-control" style={{ justifyContent: 'flex-start' }}>
            <button className="btn btn-primary" onClick={save} disabled={!canSave}>
              Save
            </button>
            <button className="btn-quiet" onClick={() => setEditingId(null)}>
              Cancel
            </button>
            {editingId !== 'new' && (
              <button
                className="btn-quiet"
                onClick={() => {
                  deleteCustomEntry(editingId);
                  setEditingId(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rise">
      <div className="page-head">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Library
        </h1>
        <button className="btn btn-ghost" onClick={openNew}>
          Write one
        </button>
      </div>

      <div className="chips" style={{ marginBottom: '1.5rem' }}>
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All {entries.length}
        </button>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className="chip"
            aria-pressed={filter === t.id}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="faint" style={{ fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.6 }}>
        Retire anything that doesn't sound like you — retired lines stop appearing in the
        daily draw.
      </p>

      {visible.map((entry) => {
        const isHidden = state.hidden.includes(entry.id);
        return (
          <div key={entry.id} className={`entry-card${isHidden ? ' hidden-entry' : ''}`}>
            <div className="entry-head">
              <div>
                <p className="line">{entry.affirmation}</p>
                <p className="entry-meta">
                  {THEMES.find((t) => t.id === entry.theme)?.label}
                  {entry.custom && ' · yours'}
                </p>
              </div>
              <div className="row-control">
                {entry.custom && (
                  <button className="btn-quiet" onClick={() => openEdit(entry)}>
                    Edit
                  </button>
                )}
                <button className="btn-quiet" onClick={() => toggleHidden(entry.id)}>
                  {isHidden ? 'Restore' : 'Retire'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
