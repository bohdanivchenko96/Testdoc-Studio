import { useState } from 'react';
import type { TestSummary } from '../../shared/testCase';
import { DuplicateIcon, PencilIcon } from '../icons';

interface Props {
  tests: TestSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (test: TestSummary) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

// Flat list, newest first (the server sorts), filtered by name.
export function TestList({ tests, selectedId, onSelect, onCreate, onRename, onDuplicate, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = tests.filter((t) => t.name.toLowerCase().includes(needle));

  return (
    <aside className="test-list">
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        Create test
      </button>
      <input className="search" type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {shown.map((t) => (
          <li key={t.id} className={t.id === selectedId ? 'selected' : undefined} onClick={() => onSelect(t.id)}>
            <div className="test-name">{t.name}</div>
            <div className="test-meta">
              {t.stepCount} {t.stepCount === 1 ? 'step' : 'steps'} · {formatTime(t.updatedAt)}
            </div>
            <div className="test-actions" onClick={(e) => e.stopPropagation()}>
              <button type="button" title="Rename" onClick={() => onRename(t.id)}>
                <PencilIcon />
              </button>
              <button type="button" title="Duplicate" onClick={() => onDuplicate(t.id)}>
                <DuplicateIcon />
              </button>
              <button type="button" title="Delete" onClick={() => onDelete(t)}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      {tests.length === 0 && <p className="muted hint">No tests yet. Create one, or drop an Xray steps CSV here.</p>}
      {tests.length > 0 && shown.length === 0 && <p className="muted hint">No tests match “{query}”.</p>}
    </aside>
  );
}
