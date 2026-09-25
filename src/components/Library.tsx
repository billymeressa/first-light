import { useState } from 'react';
import { THEMES, type Entry, type Theme } from '../content/types';
import {
  addCustomEntry,
  createSet,
  deleteCustomEntry,
  deleteSet,
  renameSet,
  setSetEntries,
  toggleHidden,
  updateCustomEntry,
  useStore,
  type PracticeSet,
} from '../state/store';
import { allEntries } from '../state/daily';
import { VoiceRecorder } from './VoiceRecorder';
import { PictureUploader } from './PictureUploader';

const BLANK = {
  theme: 'confidence' as Theme,
  affirmation: '',
};

type Tab = 'entries' | 'sets';

export function Library() {
  const state = useStore();
  const entries = allEntries(state);

  const [tab, setTab] = useState<Tab>('entries');

  // Entry editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...BLANK });
  const [filter, setFilter] = useState<Theme | 'all'>('all');
  const [voiceOpenId, setVoiceOpenId] = useState<string | null>(null);
  const [pictureOpenId, setPictureOpenId] = useState<string | null>(null);

  // Set editor
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setDraftName, setSetDraftName] = useState('');
  const [setDraftEntryIds, setSetDraftEntryIds] = useState<string[]>([]);
  const [setPickerFilter, setSetPickerFilter] = useState<Theme | 'all'>('all');

  const openNew = () => {
    setDraft({ ...BLANK });
    setEditingId('new');
  };

  const openEdit = (entry: Entry) => {
    setDraft({
      theme: entry.theme,
      affirmation: entry.affirmation,
    });
    setEditingId(entry.id);
  };

  const save = () => {
    if (!draft.affirmation.trim()) return;

    const payload = {
      theme: draft.theme,
      affirmation: draft.affirmation.trim(),
    };

    if (editingId === 'new') {
      addCustomEntry({ id: `u${Date.now().toString(36)}`, custom: true, ...payload });
    } else if (editingId) {
      updateCustomEntry(editingId, payload);
    }
    setEditingId(null);
  };

  const openNewSet = () => {
    setSetDraftName('');
    setSetDraftEntryIds([]);
    setSetPickerFilter('all');
    setEditingSetId('new');
  };

  const openEditSet = (set: PracticeSet) => {
    setSetDraftName(set.name);
    setSetDraftEntryIds(set.entryIds);
    setSetPickerFilter('all');
    setEditingSetId(set.id);
  };

  const saveSet = () => {
    const name = setDraftName.trim();
    if (!name) return;
    if (editingSetId === 'new') {
      const id = createSet(name);
      setSetEntries(id, setDraftEntryIds);
    } else if (editingSetId) {
      renameSet(editingSetId, name);
      setSetEntries(editingSetId, setDraftEntryIds);
    }
    setEditingSetId(null);
  };

  const toggleDraftEntry = (id: string) => {
    setSetDraftEntryIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  };

  const moveDraftEntry = (index: number, dir: -1 | 1) => {
    setSetDraftEntryIds((ids) => {
      const target = index + dir;
      if (target < 0 || target >= ids.length) return ids;
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const visible = filter === 'all' ? entries : entries.filter((e) => e.theme === filter);
  const canSave = draft.affirmation.trim().length > 0;

  if (editingId) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          {editingId === 'new' ? 'Write your own' : 'Edit'}
        </h1>

        <div className="row-control sticky-actions" style={{ justifyContent: 'flex-start' }}>
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
              rows={3}
              value={draft.affirmation}
              placeholder="I am someone who…"
              onChange={(e) => setDraft({ ...draft, affirmation: e.target.value })}
            />
          </label>
        </div>
      </div>
    );
  }

  if (editingSetId) {
    const selected = setDraftEntryIds
      .map((id) => entries.find((e) => e.id === id))
      .filter((e): e is Entry => e !== undefined);
    const available = (
      setPickerFilter === 'all' ? entries : entries.filter((e) => e.theme === setPickerFilter)
    ).filter((e) => !setDraftEntryIds.includes(e.id));

    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          {editingSetId === 'new' ? 'New set' : 'Edit set'}
        </h1>

        <div className="row-control sticky-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={saveSet} disabled={!setDraftName.trim()}>
            Save
          </button>
          <button className="btn-quiet" onClick={() => setEditingSetId(null)}>
            Cancel
          </button>
          {editingSetId !== 'new' && (
            <button
              className="btn-quiet"
              onClick={() => {
                deleteSet(editingSetId);
                setEditingSetId(null);
              }}
            >
              Delete set
            </button>
          )}
        </div>

        <div className="editor">
          <label>
            Name
            <input
              type="text"
              value={setDraftName}
              placeholder="Morning confidence"
              onChange={(e) => setSetDraftName(e.target.value)}
            />
          </label>

          <div>
            <p className="faint" style={{ fontSize: '0.8rem', marginBottom: '0.6rem' }}>
              In this set, practiced in this order.
            </p>
            {selected.length === 0 && (
              <p className="faint" style={{ fontSize: '0.85rem' }}>
                Nothing added yet — pick from the library below.
              </p>
            )}
            {selected.map((entry, i) => (
              <div key={entry.id} className="entry-card">
                <div className="entry-head">
                  <p className="line">{entry.affirmation}</p>
                  <div className="row-control">
                    <button
                      className="btn-quiet"
                      onClick={() => moveDraftEntry(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="btn-quiet"
                      onClick={() => moveDraftEntry(i, 1)}
                      disabled={i === selected.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button className="btn-quiet" onClick={() => toggleDraftEntry(entry.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="faint" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0.6rem' }}>
              Add from the library
            </p>
            <div className="chips" style={{ marginBottom: '1rem' }}>
              <button
                className="chip"
                aria-pressed={setPickerFilter === 'all'}
                onClick={() => setSetPickerFilter('all')}
              >
                All
              </button>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className="chip"
                  aria-pressed={setPickerFilter === t.id}
                  onClick={() => setSetPickerFilter(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {available.map((entry) => (
              <div key={entry.id} className="entry-card">
                <div className="entry-head">
                  <p className="line">{entry.affirmation}</p>
                  <button className="btn-quiet" onClick={() => toggleDraftEntry(entry.id)}>
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rise">
      {/* No heading — the top bar already names the screen. The segmented
          control and its matching action share one row instead. */}
      <div className="page-head">
        <div className="chips">
          <button className="chip" aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>
            Entries
          </button>
          <button className="chip" aria-pressed={tab === 'sets'} onClick={() => setTab('sets')}>
            Sets{state.sets.length ? ` · ${state.sets.length}` : ''}
          </button>
        </div>
        <button
          className="btn-quiet action-link"
          onClick={tab === 'entries' ? openNew : openNewSet}
        >
          {tab === 'entries' ? '+ Write one' : '+ New set'}
        </button>
      </div>

      {tab === 'entries' ? (
        <>
          <div className="chips" style={{ marginBottom: '1.5rem' }}>
            <button
              className="chip"
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
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
                      {entry.source === 'journal' ? ' · from your journal' : entry.custom && ' · yours'}
                    </p>
                  </div>
                  <div className="row-control">
                    {entry.custom && (
                      <button className="btn-quiet" onClick={() => openEdit(entry)}>
                        Edit
                      </button>
                    )}
                    <button
                      className="btn-quiet"
                      aria-pressed={voiceOpenId === entry.id}
                      onClick={() => setVoiceOpenId((id) => (id === entry.id ? null : entry.id))}
                    >
                      Voice
                    </button>
                    <button
                      className="btn-quiet"
                      aria-pressed={pictureOpenId === entry.id}
                      onClick={() => setPictureOpenId((id) => (id === entry.id ? null : entry.id))}
                    >
                      Picture
                    </button>
                    <button className="btn-quiet" onClick={() => toggleHidden(entry.id)}>
                      {isHidden ? 'Restore' : 'Retire'}
                    </button>
                  </div>
                </div>
                {voiceOpenId === entry.id && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <VoiceRecorder entryId={entry.id} />
                  </div>
                )}
                {pictureOpenId === entry.id && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <PictureUploader entryId={entry.id} />
                  </div>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <p className="faint" style={{ fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            A set is a handful of affirmations to move through in one sitting, in an order
            you choose. Start one from the home screen.
          </p>

          {state.sets.length === 0 && (
            <p className="faint" style={{ fontSize: '0.85rem' }}>
              You haven't built a set yet.
            </p>
          )}

          {state.sets.map((set) => (
            <div key={set.id} className="entry-card">
              <div className="entry-head">
                <div>
                  <p className="line">{set.name}</p>
                  <p className="entry-meta">
                    {set.entryIds.length} affirmation{set.entryIds.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button className="btn-quiet" onClick={() => openEditSet(set)}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
