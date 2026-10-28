import { EditorContent, useEditor } from '@tiptap/react';
import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { docToWiki, wikiToDoc } from '../../../shared/wikiDoc';
import { DocFilesContext, EXTENSIONS, INPUT_RULE_EXTENSIONS, PASTE_RULE_EXTENSIONS, type DocFiles } from './extensions';
import { VisualToolbar } from './VisualToolbar';

// What DocEditor inserts once an upload or a diagram save finishes.
export interface VisualEditorApi {
  insertImage: (name: string) => void;
  insertDiagram: (name: string) => void;
}

interface Props {
  // Read once on mount; DocEditor remounts the editor when it switches back from the markup mode.
  markup: string;
  // Memoized by the caller: node views re-render when it changes.
  files: DocFiles;
  apiRef: Ref<VisualEditorApi | null>;
  // Shown above the page body, e.g. the doc name.
  header: ReactNode;
  onChange: (markup: string) => void;
  onPasteImage: (image: Blob) => void;
  onImage: () => void;
  onDiagram: () => void;
}

// Confluence-like editing. The markup is regenerated from the document on every change (docs/spec.md > Docs > Editor),
// so a doc that is only opened, not edited, keeps its markup untouched.
export function VisualEditor({ markup, files, apiRef, header, onChange, onPasteImage, onImage, onDiagram }: Props) {
  // The editor is created once; its handlers call the latest props through this ref.
  const latest = useRef({ onChange, onPasteImage });
  latest.current = { onChange, onPasteImage };

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: wikiToDoc(markup),
    enableInputRules: INPUT_RULE_EXTENSIONS,
    enablePasteRules: PASTE_RULE_EXTENSIONS,
    editorProps: {
      attributes: { class: 'wiki visual-body', 'aria-label': 'Doc content', spellcheck: 'true' },
      handlePaste: (_view, event) => {
        // Screenshots arrive as an image only; text that comes along wins (e.g. cells copied from a spreadsheet).
        const data = event.clipboardData;
        const image = data && [...data.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
        const file = image && !data.getData('text/plain') ? image.getAsFile() : null;
        if (!file) return false;
        latest.current.onPasteImage(file);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => latest.current.onChange(docToWiki(e.getJSON())),
  });

  useImperativeHandle(
    apiRef,
    () => ({
      insertImage: (name) => editor.chain().focus().insertContent({ type: 'wikiImage', attrs: { name, params: null } }).run(),
      insertDiagram: (name) => editor.chain().focus().insertContent({ type: 'diagram', attrs: { name } }).run(),
    }),
    [editor],
  );

  return (
    <DocFilesContext.Provider value={files}>
      <div className="visual-editor">
        <VisualToolbar editor={editor} onImage={onImage} onDiagram={onDiagram} />
        <div className="visual-scroll">
          <div className="visual-page">
            {header}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </DocFilesContext.Provider>
  );
}
