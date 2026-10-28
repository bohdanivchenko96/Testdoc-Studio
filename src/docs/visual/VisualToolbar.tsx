import { useEditorState, type Editor } from '@tiptap/react';
import { MOD } from '../../platform';
import { PANEL_KINDS } from './extensions';

interface Props {
  editor: Editor;
  onImage: () => void;
  onDiagram: () => void;
}

type Tool = { label: string; title: string; active?: boolean; disabled?: boolean; run: () => void };

// Same buttons as the markup toolbar, but they format the selection the way Confluence's editor does.
export function VisualToolbar({ editor, onImage, onDiagram }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: [1, 2, 3].map((level) => e.isActive('heading', { level })),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      codeBlock: e.isActive('codeBlock'),
      panel: PANEL_KINDS.find((kind) => e.isActive('panel', { kind })) ?? null,
      inTable: e.isActive('table'),
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  const togglePanel = (kind: string) => {
    if (state.panel === kind) chain().lift('panel').run();
    else if (state.panel) chain().updateAttributes('panel', { kind }).run();
    else chain().wrapIn('panel', { kind }).run();
  };

  const groups: Tool[][] = [
    [
      { label: '↶', title: `Undo (${MOD}+Z)`, disabled: !state.canUndo, run: () => chain().undo().run() },
      { label: '↷', title: `Redo (${MOD}+Shift+Z)`, disabled: !state.canRedo, run: () => chain().redo().run() },
    ],
    [1, 2, 3].map((level) => ({
      label: `H${level}`,
      title: `Heading ${level}`,
      active: state.heading[level - 1],
      run: () => chain().toggleHeading({ level: level as 1 | 2 | 3 }).run(),
    })),
    [
      { label: 'B', title: `Bold (${MOD}+B)`, active: state.bold, run: () => chain().toggleBold().run() },
      { label: 'I', title: `Italic (${MOD}+I)`, active: state.italic, run: () => chain().toggleItalic().run() },
      { label: '{{ }}', title: `Monospace (${MOD}+E)`, active: state.code, run: () => chain().toggleCode().run() },
    ],
    [
      { label: '•', title: 'Bullet list', active: state.bulletList, run: () => chain().toggleBulletList().run() },
      { label: '1.', title: 'Numbered list', active: state.orderedList, run: () => chain().toggleOrderedList().run() },
      { label: 'Table', title: 'Insert a table', run: () => chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() },
      { label: '</>', title: 'Code block', active: state.codeBlock, run: () => chain().toggleCodeBlock().run() },
    ],
    PANEL_KINDS.map((kind) => ({
      label: kind[0].toUpperCase() + kind.slice(1),
      title: `${kind} panel: wraps the selected blocks; again to unwrap`,
      active: state.panel === kind,
      run: () => togglePanel(kind),
    })),
    [
      { label: 'Image', title: `Insert an image file (or paste one with ${MOD}+V)`, run: onImage },
      { label: 'Diagram', title: 'Draw a diagram', run: onDiagram },
    ],
  ];

  const tableTools: Tool[] = [
    { label: '+ Row', title: 'Add a row below', run: () => chain().addRowAfter().run() },
    { label: '+ Col', title: 'Add a column to the right', run: () => chain().addColumnAfter().run() },
    { label: '− Row', title: 'Delete this row', run: () => chain().deleteRow().run() },
    { label: '− Col', title: 'Delete this column', run: () => chain().deleteColumn().run() },
    {
      label: 'Merge',
      title: 'Merge the selected cells (drag across cells to select). Confluence gets ⇐/⇑ markers to merge by hand',
      disabled: !state.canMerge,
      run: () => chain().mergeCells().run(),
    },
    { label: 'Split', title: 'Split the merged cell', disabled: !state.canSplit, run: () => chain().splitCell().run() },
    { label: 'Header', title: 'Toggle the header row', run: () => chain().toggleHeaderRow().run() },
    { label: '✕ Table', title: 'Delete the table', run: () => chain().deleteTable().run() },
  ];

  const button = (tool: Tool) => (
    <button
      key={tool.title}
      type="button"
      title={tool.title}
      className={tool.active ? 'active' : undefined}
      disabled={tool.disabled}
      // Keeps the editor's selection: the button never takes focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={tool.run}
    >
      {tool.label}
    </button>
  );

  return (
    <div className="doc-toolbar visual-toolbar">
      {groups.map((group, i) => (
        <div key={i} className="doc-toolbar-group">
          {group.map(button)}
        </div>
      ))}
      {/* Always shown, so the page doesn't jump when the caret enters a table; disabled outside one. */}
      <div className="doc-toolbar-group">{tableTools.map((t) => button({ ...t, disabled: !state.inTable || t.disabled }))}</div>
    </div>
  );
}
