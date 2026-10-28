import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Step } from '../../shared/testCase';
import { testsApi } from '../api';
import { SAVE_STATUS_TEXT, useAutosave } from '../useAutosave';
import { StepGrid, toRow, type Row } from './StepGrid';

type Patch = { name?: string; steps?: Step[] };

interface Props {
  id: string;
  // Bumped by the list's Rename action to focus the title.
  focusTitle: number;
  // Lets the parent save pending edits before it duplicates, deletes or exports.
  flushRef: RefObject<(() => Promise<void>) | null>;
  onSaved: () => void;
  onError: (e: unknown) => void;
  onInfo: (text: string) => void;
}

// Edits are saved automatically shortly after the last change.
export function TestEditor({ id, focusTitle, flushRef, onSaved, onError, onInfo }: Props) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const loaded = rows !== null;
  const { status, schedule, flush } = useAutosave<Patch>(async (patch) => {
    await testsApi.update(id, patch);
    onSaved();
  }, onError);

  useEffect(() => {
    testsApi.get(id).then((t) => {
      setName(t.name);
      setRows(t.steps.map(toRow));
    }, onError);
  }, [id, onError]);

  useEffect(() => {
    if (focusTitle && loaded) titleRef.current?.select();
  }, [focusTitle, loaded]);

  useEffect(() => {
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flush, flushRef]);

  const changeRows = (next: Row[]) => {
    setRows(next);
    schedule({ steps: next.map((r) => r.step) });
  };

  const exportCsv = async () => {
    await flush();
    try {
      const { path } = await testsApi.exportCsv(id);
      onInfo(`Exported to ${path}`);
    } catch (e) {
      onError(e);
    }
  };

  if (!rows) return <div className="editor muted">Loading…</div>;

  return (
    <div className="editor">
      <div className="editor-head">
        <input
          ref={titleRef}
          className="title-input"
          value={name}
          aria-label="Test name"
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) schedule({ name: e.target.value });
          }}
          onBlur={() => {
            if (name.trim()) return;
            setName('Untitled test');
            schedule({ name: 'Untitled test' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className={status === 'failed' ? 'save-status failed' : 'save-status'}>{SAVE_STATUS_TEXT[status]}</span>
        <button type="button" className="btn btn-primary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <StepGrid rows={rows} onChange={changeRows} />
    </div>
  );
}
