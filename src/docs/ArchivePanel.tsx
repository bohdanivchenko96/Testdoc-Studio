import { useCallback, useEffect, useState } from 'react';
import type { DocSummary } from '../../shared/doc';
import { docsApi } from '../api';

interface Props {
  onOpen: (id: string) => void;
  onClose: () => void;
  onError: (e: unknown) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

// Every doc except the current one, newest first (the server sorts).
export function ArchivePanel({ onOpen, onClose, onError }: Props) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const reload = useCallback(() => docsApi.archive().then(setDocs, onError), [onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async (doc: DocSummary) => {
    if (!window.confirm(`Delete doc "${doc.name}" and its files? This cannot be undone.`)) return;
    try {
      await docsApi.remove(doc.id);
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  const needle = query.trim().toLowerCase();
  const shown = (docs ?? []).filter((d) => d.name.toLowerCase().includes(needle));

  return (
    <aside className="archive-panel" aria-label="Archive">
      <div className="archive-head">
        <strong>Archive</strong>
        <button type="button" className="icon-button" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <input className="search" type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      {docs && docs.length === 0 && <p className="muted hint">The archive is empty. New doc moves the current doc here.</p>}
      {docs && docs.length > 0 && shown.length === 0 && <p className="muted hint">No docs match “{query}”.</p>}
      <ul>
        {shown.map((d) => (
          <li key={d.id}>
            <div className="archive-name">{d.name}</div>
            <div className="test-meta">{formatTime(d.updatedAt)}</div>
            <div className="archive-actions">
              <button type="button" className="btn" onClick={() => onOpen(d.id)}>
                Open
              </button>
              <button type="button" className="btn" onClick={() => remove(d)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
