import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Doc } from '../../shared/doc';
import { diagramPlaceholder } from '../../shared/wikiMarkup';
import { docsApi } from '../api';
import { continueList, insertBlock, isPlainEnter, replaceSelection, type TextEdit } from '../markupEdit';
import { SAVE_STATUS_TEXT, useAutosave } from '../useAutosave';
import { WikiPreview } from '../WikiPreview';
import { DiagramCanvas } from './DiagramCanvas';
import { DocToolbar } from './DocToolbar';
import { toPng } from './files';
import type { DocFiles } from './visual/extensions';
import { VisualEditor, type VisualEditorApi } from './visual/VisualEditor';

type Patch = { name?: string; markup?: string };
type Selection = { start: number; end: number };

interface Props {
  doc: Doc;
  // Lets the parent save pending edits before it switches docs or imports.
  flushRef: RefObject<(() => Promise<void>) | null>;
  // Buttons the parent owns (New doc, Archive), shown in the top bar.
  actions: ReactNode;
  onError: (e: unknown) => void;
  onExported: (path: string, warnings: string[]) => void;
}

const isExternal = (name: string) => /^[a-z][a-z0-9+.-]*:/i.test(name);

type Mode = 'visual' | 'markup';
const MODE_KEY = 'docs.editorMode';

// The last mode is a per-browser convenience; storage can be unavailable.
function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'markup' ? 'markup' : 'visual';
  } catch {
    return 'visual';
  }
}

function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

// Visual (Confluence-like) or Markup (textarea + live preview); both edit the same markup. Keyed by doc id: pending
// edits are flushed on unmount.
export function DocEditor({ doc, flushRef, actions, onError, onExported }: Props) {
  const [mode, setMode] = useState<Mode>(readMode);
  const [name, setName] = useState(doc.name);
  const [markup, setMarkup] = useState(doc.markup);
  // Set while the visual editor is mounted; uploads and diagram saves insert through it.
  const visualApi = useRef<VisualEditorApi | null>(null);
  // Bumped when a diagram PNG is overwritten, so the preview reloads it.
  const [filesVersion, setFilesVersion] = useState(0);
  // null: canvas closed; { diagram: null }: new diagram.
  const [canvas, setCanvas] = useState<{ diagram: string | null } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nextSelection = useRef<Selection | null>(null);
  // Where an image or diagram goes once its async upload finishes.
  const insertAt = useRef<Selection>({ start: doc.markup.length, end: doc.markup.length });
  const { status, schedule, flush } = useAutosave<Patch>((patch) => docsApi.update(doc.id, patch).then(() => undefined), onError);

  useEffect(() => {
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flush, flushRef]);

  useLayoutEffect(() => {
    if (!nextSelection.current) return;
    textareaRef.current?.setSelectionRange(nextSelection.current.start, nextSelection.current.end);
    nextSelection.current = null;
  }, [markup]);

  const files = useMemo<DocFiles>(
    () => ({
      fileUrl: (file) => (isExternal(file) ? file : docsApi.fileUrl(doc.id, file, filesVersion)),
      openDiagram: (diagram) => setCanvas({ diagram }),
    }),
    [doc.id, filesVersion],
  );
  const previewOptions = useMemo(() => ({ imageUrl: files.fileUrl }), [files]);

  const changeMarkup = (value: string) => {
    setMarkup(value);
    schedule({ markup: value });
  };

  const currentSelection = (): Selection => {
    const ta = textareaRef.current!;
    return { start: ta.selectionStart, end: ta.selectionEnd };
  };

  // Applies an edit to the textarea's current value. `at` overrides the live selection (for async inserts).
  const applyEdit = (apply: (e: TextEdit) => TextEdit, at?: Selection) => {
    const ta = textareaRef.current!;
    const { start, end } = at ?? currentSelection();
    const next = apply({ value: ta.value, start: Math.min(start, ta.value.length), end: Math.min(end, ta.value.length) });
    nextSelection.current = { start: next.start, end: next.end };
    changeMarkup(next.value);
    ta.focus();
  };

  // `at` is the markup selection; the visual editor inserts at its own selection.
  const insertImage = async (image: Blob, at?: Selection) => {
    try {
      // The server picks N above every number the saved markup references, so save the latest markup first.
      await flush();
      const file = await docsApi.addImage(doc.id, await toPng(image));
      if (visualApi.current) visualApi.current.insertImage(file);
      else applyEdit((e) => replaceSelection(e, `!${file}!`), at);
    } catch (e) {
      onError(e);
    }
  };

  const pickImage = () => {
    if (!visualApi.current) insertAt.current = currentSelection();
    imageInputRef.current?.click();
  };

  const newDiagram = () => {
    if (!visualApi.current) insertAt.current = currentSelection();
    void flush();
    setCanvas({ diagram: null });
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    saveMode(next);
  };

  const exportDoc = async () => {
    await flush();
    try {
      const { path, warnings } = await docsApi.exportDoc(doc.id);
      onExported(path, warnings);
    } catch (e) {
      onError(e);
    }
  };

  const diagramSaved = (diagram: string, isNew: boolean) => {
    setFilesVersion((v) => v + 1);
    if (!isNew) return;
    if (visualApi.current) visualApi.current.insertDiagram(diagram);
    else applyEdit((e) => insertBlock(e, diagramPlaceholder(diagram)), insertAt.current);
  };

  // In the visual mode the name is the page title, as in Confluence; in the markup mode it sits in the top bar.
  const nameInput = (
    <input
      className={mode === 'visual' ? 'visual-title' : 'title-input'}
      value={name}
      aria-label="Doc name"
      placeholder="Page title"
      onChange={(e) => {
        setName(e.target.value);
        if (e.target.value.trim()) schedule({ name: e.target.value });
      }}
      onBlur={() => {
        if (name.trim()) return;
        setName('Untitled doc');
        schedule({ name: 'Untitled doc' });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );

  return (
    <div className="doc-editor">
      <div className="editor-head">
        {mode === 'markup' ? nameInput : <div className="editor-head-spacer" />}
        <div className="mode-switch" role="group" aria-label="Editor mode">
          {(['visual', 'markup'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'active' : undefined} aria-pressed={mode === m} onClick={() => switchMode(m)}>
              {m === 'visual' ? 'Visual' : 'Markup'}
            </button>
          ))}
        </div>
        <span className={status === 'failed' ? 'save-status failed' : 'save-status'}>{SAVE_STATUS_TEXT[status]}</span>
        {actions}
        <button type="button" className="btn btn-primary" onClick={exportDoc}>
          Export
        </button>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void insertImage(file, insertAt.current);
        }}
      />
      {mode === 'visual' ? (
        <VisualEditor
          markup={markup}
          files={files}
          apiRef={visualApi}
          header={nameInput}
          onChange={changeMarkup}
          onPasteImage={(image) => void insertImage(image)}
          onImage={pickImage}
          onDiagram={newDiagram}
        />
      ) : (
        <>
          <DocToolbar onEdit={(apply) => applyEdit(apply)} onImage={pickImage} onDiagram={newDiagram} />
          <div className="doc-split">
            <textarea
              ref={textareaRef}
              className="doc-markup"
              value={markup}
              spellCheck={false}
              aria-label="Wiki markup"
              onChange={(e) => changeMarkup(e.target.value)}
              onKeyDown={(e) => {
                if (!isPlainEnter(e)) return;
                const next = continueList({ value: e.currentTarget.value, ...currentSelection() });
                if (!next) return;
                e.preventDefault();
                applyEdit(() => next);
              }}
              onPaste={(e) => {
                // Screenshots arrive as an image only. When text comes along (e.g. cells copied from a spreadsheet), paste the text.
                const image = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
                if (!image || e.clipboardData.getData('text/plain')) return;
                const file = image.getAsFile();
                if (!file) return;
                e.preventDefault();
                void insertImage(file, currentSelection());
              }}
            />
            <WikiPreview className="doc-preview" markup={markup} options={previewOptions} onDiagramClick={files.openDiagram} />
          </div>
        </>
      )}
      {canvas && (
        <DiagramCanvas
          docId={doc.id}
          diagram={canvas.diagram}
          onSaved={(diagram) => {
            diagramSaved(diagram, canvas.diagram === null);
            // Close may have been clicked while the save was in flight; don't reopen then.
            setCanvas((open) => (open ? { diagram } : null));
          }}
          onClose={() => setCanvas(null)}
          onError={onError}
        />
      )}
    </div>
  );
}
