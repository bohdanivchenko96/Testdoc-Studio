import { useEffect, useRef, useState } from 'react';
import type { Step } from '../../shared/testCase';
import { StepCell } from './StepCell';

// A step plus a React key that survives reordering.
export interface Row {
  key: number;
  step: Step;
}

let nextKey = 1;
export const toRow = (step: Step): Row => ({ key: nextKey++, step });

const EMPTY_STEP: Step = { action: '', data: '', expectedResult: '' };

// Modeled on the Xray Grid view: number, Action, Data, Expected Result, row actions.
export function StepGrid({ rows, onChange }: { rows: Row[]; onChange: (rows: Row[]) => void }) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // Row keys, so a selection survives reordering. Keys of deleted rows are simply never matched.
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  // Anchor for Shift+click range selection.
  const lastClicked = useRef<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedCount = rows.filter((r) => selected.has(r.key)).length;

  useEffect(() => {
    selectAllRef.current!.indeterminate = selectedCount > 0 && selectedCount < rows.length;
  }, [selectedCount, rows.length]);

  const toggle = (index: number, shift: boolean) => {
    const next = new Set(selected);
    const on = !selected.has(rows[index].key);
    const anchor = shift && lastClicked.current !== null ? Math.min(lastClicked.current, rows.length - 1) : index;
    for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) {
      if (on) next.add(rows[i].key);
      else next.delete(rows[i].key);
    }
    lastClicked.current = index;
    setSelected(next);
  };

  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selectedCount} selected step${selectedCount === 1 ? '' : 's'}?`)) return;
    onChange(rows.filter((r) => !selected.has(r.key)));
    setSelected(new Set());
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };
  const setField = (index: number, field: keyof Step, value: string) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, step: { ...r.step, [field]: value } } : r)));
  const insertAt = (index: number, step: Step) => onChange([...rows.slice(0, index), toRow(step), ...rows.slice(index)]);
  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <div className="step-grid">
      {selectedCount > 0 && (
        <div className="grid-bulk">
          <span>{selectedCount} selected</span>
          <button type="button" className="btn" onClick={deleteSelected}>
            Delete selected
          </button>
          <button type="button" className="btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="grid-row grid-head">
        <div className="step-num">
          <input
            ref={selectAllRef}
            type="checkbox"
            title="Select all steps"
            disabled={rows.length === 0}
            checked={rows.length > 0 && selectedCount === rows.length}
            onChange={() => setSelected(selectedCount === rows.length ? new Set() : new Set(rows.map((r) => r.key)))}
          />
          #
        </div>
        <div>Action</div>
        <div>Data</div>
        <div>Expected Result</div>
        <div />
      </div>
      {rows.map((row, i) => {
        let className = 'grid-row';
        if (selected.has(row.key)) className += ' selected';
        if (dragFrom === i) className += ' dragging';
        if (dragFrom !== null && dropAt === i && dropAt !== dragFrom) className += dropAt < dragFrom ? ' drop-above' : ' drop-below';
        return (
          <div
            key={row.key}
            className={className}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              e.stopPropagation();
              setDropAt(i);
            }}
            onDrop={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              e.stopPropagation();
              move(dragFrom, i);
              endDrag();
            }}
          >
            <div className="step-num">
              <input
                type="checkbox"
                title="Select step (Shift+click selects a range)"
                checked={selected.has(row.key)}
                // Handled in onClick, which (unlike onChange) carries shiftKey.
                readOnly
                onClick={(e) => toggle(i, e.shiftKey)}
              />
              <span
                className="drag-handle"
                draggable
                title="Drag to reorder"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i + 1));
                  e.dataTransfer.setDragImage(e.currentTarget.closest('.grid-row')!, 16, 16);
                  setDragFrom(i);
                }}
                onDragEnd={endDrag}
              >
                ⠿
              </span>
              {i + 1}
              {/* On the row's top and bottom edges, shown on hover: one click inserts an empty step there. */}
              <button type="button" className="row-insert row-insert-above" title="Insert a step above" onClick={() => insertAt(i, EMPTY_STEP)}>
                +
              </button>
              <button type="button" className="row-insert row-insert-below" title="Insert a step below" onClick={() => insertAt(i + 1, EMPTY_STEP)}>
                +
              </button>
            </div>
            <StepCell value={row.step.action} onChange={(v) => setField(i, 'action', v)} emptyLabel="Action is required" required />
            <StepCell value={row.step.data} onChange={(v) => setField(i, 'data', v)} emptyLabel="None" />
            <StepCell value={row.step.expectedResult} onChange={(v) => setField(i, 'expectedResult', v)} emptyLabel="None" />
            <div className="row-actions">
              <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                ↑
              </button>
              <button type="button" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                ↓
              </button>
              <button type="button" title="Duplicate step" onClick={() => insertAt(i + 1, row.step)}>
                ⧉
              </button>
              <button type="button" title="Delete step" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn add-step" onClick={() => insertAt(rows.length, EMPTY_STEP)}>
        + Add step
      </button>
    </div>
  );
}
