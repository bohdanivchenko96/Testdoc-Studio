import { insertBlock, prefixLines, wrapSelection, type TextEdit } from '../markupEdit';

type Tool = { label: string; title: string; apply: (e: TextEdit) => TextEdit };

const panel = (kind: string): Tool => ({
  label: kind[0].toUpperCase() + kind.slice(1),
  title: `${kind} panel ({${kind}})`,
  apply: (e) => wrapSelection(e, `{${kind}}\n`, `\n{${kind}}`),
});

const TOOLS: Tool[][] = [
  [
    { label: 'H1', title: 'Heading 1 (h1.)', apply: (e) => prefixLines(e, 'h1. ') },
    { label: 'H2', title: 'Heading 2 (h2.)', apply: (e) => prefixLines(e, 'h2. ') },
    { label: 'H3', title: 'Heading 3 (h3.)', apply: (e) => prefixLines(e, 'h3. ') },
  ],
  [
    { label: 'B', title: 'Bold (*text*)', apply: (e) => wrapSelection(e, '*', '*') },
    { label: 'I', title: 'Italic (_text_)', apply: (e) => wrapSelection(e, '_', '_') },
    { label: '{{ }}', title: 'Monospace ({{text}})', apply: (e) => wrapSelection(e, '{{', '}}') },
  ],
  [
    { label: '•', title: 'Bullet list (* )', apply: (e) => prefixLines(e, '* ') },
    { label: '1.', title: 'Numbered list (# )', apply: (e) => prefixLines(e, '# ') },
    {
      label: 'Table',
      title: 'Table (||header|| and |cell|)',
      apply: (e) => insertBlock(e, '||Header||Header||\n|Cell|Cell|'),
    },
    { label: '</>', title: 'Code block ({code})', apply: (e) => wrapSelection(e, '{code}\n', '\n{code}') },
  ],
  [panel('info'), panel('note'), panel('warning')],
];

interface Props {
  onEdit: (apply: (e: TextEdit) => TextEdit) => void;
  onImage: () => void;
  onDiagram: () => void;
}

// Buttons keep the textarea focused (mousedown is cancelled), so the edit applies to the current selection.
export function DocToolbar({ onEdit, onImage, onDiagram }: Props) {
  const button = (label: string, title: string, onClick: () => void) => (
    <button key={title} type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div className="doc-toolbar">
      {TOOLS.map((group, i) => (
        <div key={i} className="doc-toolbar-group">
          {group.map((tool) => button(tool.label, tool.title, () => onEdit(tool.apply)))}
        </div>
      ))}
      <div className="doc-toolbar-group">
        {button('Image', 'Insert an image file (or paste one with Cmd+V)', onImage)}
        {button('Diagram', 'Draw a diagram', onDiagram)}
      </div>
    </div>
  );
}
