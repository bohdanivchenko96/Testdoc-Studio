// Toolbar edits on a textarea's value. Each returns the new value and selection.

import type { KeyboardEvent } from 'react';

export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

// Prefixes every line touched by the selection, e.g. "# " for a numbered list.
export function prefixLines({ value, start, end }: TextEdit, prefix: string): TextEdit {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const block = value.slice(from, end);
  const lines = block.split('\n');
  const prefixed = lines.map((l) => prefix + l).join('\n');
  return {
    value: value.slice(0, from) + prefixed + value.slice(end),
    start: start + prefix.length,
    end: end + prefix.length * lines.length,
  };
}

// Wraps the selection, e.g. in "*…*" for bold. With no selection the caret lands between the markers.
export function wrapSelection({ value, start, end }: TextEdit, before: string, after: string): TextEdit {
  return {
    value: value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end),
    start: start + before.length,
    end: end + before.length,
  };
}

// Replaces the selection with text and puts the caret after it.
export function replaceSelection({ value, start, end }: TextEdit, text: string): TextEdit {
  const caret = start + text.length;
  return { value: value.slice(0, start) + text + value.slice(end), start: caret, end: caret };
}

const LIST_ITEM_RE = /^([#*]+|-) /;

// Enter without modifiers or an open IME composition; Shift+Enter stays a plain line break.
export const isPlainEnter = (e: KeyboardEvent) =>
  e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing;

// Enter inside a list item: the next line starts with the same marker ("# ", "#* ", "- "). Enter on an empty item
// ends the list, or for a nested item ("#* ") moves it one level up ("# "). Returns null when Enter should stay plain.
export function continueList({ value, start, end }: TextEdit): TextEdit | null {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start);
  const line = value.slice(lineStart, lineEnd);
  const m = LIST_ITEM_RE.exec(line);
  if (!m || start < lineStart + m[0].length) return null;
  if (line.slice(m[0].length).trim() === '') {
    const marker = m[1].length > 1 ? `${m[1].slice(0, -1)} ` : '';
    const caret = lineStart + marker.length;
    return { value: value.slice(0, lineStart) + marker + value.slice(lineEnd), start: caret, end: caret };
  }
  return replaceSelection({ value, start, end }, `\n${m[0]}`);
}

// Like replaceSelection, but keeps a block (table, diagram placeholder) on lines of its own.
export function insertBlock(edit: TextEdit, block: string): TextEdit {
  const before = edit.start > 0 && edit.value[edit.start - 1] !== '\n' ? '\n' : '';
  const after = edit.end < edit.value.length && edit.value[edit.end] !== '\n' ? '\n' : '';
  return replaceSelection(edit, before + block + after);
}
