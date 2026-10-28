import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CopyIcon } from '../icons';
import { WikiPreview } from '../WikiPreview';
import { continueList, isPlainEnter, prefixLines, wrapSelection, type TextEdit } from '../markupEdit';

const TOOLS: { label: string; title: string; apply: (e: TextEdit) => TextEdit }[] = [
  { label: '1.', title: 'Numbered list (# )', apply: (e) => prefixLines(e, '# ') },
  { label: '•', title: 'Nested bullet (#* )', apply: (e) => prefixLines(e, '#* ') },
  { label: 'B', title: 'Bold (*text*)', apply: (e) => wrapSelection(e, '*', '*') },
  { label: '</>', title: 'Code block ({code})', apply: (e) => wrapSelection(e, '{code}\n', '\n{code}') },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
  required?: boolean;
}

// Shows the markup preview; click (or Enter) switches to a textarea. The value only changes when the user types,
// so text that is never edited keeps its original line endings.
export function StepCell({ value, onChange, emptyLabel, required }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) return <CellEditor value={value} onChange={onChange} onDone={() => setEditing(false)} />;

  const invalid = required && value.trim() === '';
  return (
    <div
      className={invalid ? 'cell cell-invalid' : 'cell'}
      tabIndex={0}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value === '' ? <span className="cell-empty">{emptyLabel}</span> : <WikiPreview markup={value} />}
      {value !== '' && <CopyButton text={value} />}
    </div>
  );
}

// Copies the cell's markup as stored, so it pastes into Jira (or another cell) unchanged.
function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1200);
  };

  return (
    <button
      type="button"
      className={`cell-copy cell-copy-${state}`}
      title={state === 'failed' ? 'Could not copy' : 'Copy the markup'}
      // The cell opens its editor on click and Enter; the button must not.
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* A clipboard, unlike the row's Duplicate button (two sheets). */}
      {state === 'copied' ? '✓' : state === 'failed' ? '!' : <CopyIcon />}
    </button>
  );
}

function CellEditor({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const nextSelection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const ta = ref.current!;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  useLayoutEffect(() => {
    const ta = ref.current!;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
    if (nextSelection.current) {
      ta.setSelectionRange(...nextSelection.current);
      nextSelection.current = null;
    }
  }, [value]);

  // Returns false when the edit doesn't apply (continueList outside a list).
  const apply = (edit: (e: TextEdit) => TextEdit | null) => {
    const ta = ref.current!;
    const next = edit({ value: ta.value, start: ta.selectionStart, end: ta.selectionEnd });
    if (!next) return false;
    nextSelection.current = [next.start, next.end];
    onChange(next.value);
    return true;
  };

  return (
    <div className="cell cell-editing">
      <div className="cell-toolbar">
        {TOOLS.map((tool) => (
          <button
            key={tool.title}
            type="button"
            title={tool.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(tool.apply)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (isPlainEnter(e) && apply(continueList)) e.preventDefault();
        }}
      />
    </div>
  );
}
