// TipTap extensions for the Docs visual editor. Node and mark names match shared/wikiDoc.ts, which converts the
// editor's JSON to and from wiki markup.

import { Extension, InputRule, mergeAttributes, Node, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { createContext, useContext } from 'react';
import { panelTitle, withPanelTitle } from '../../../shared/wikiDoc';

export interface DocFiles {
  // URL of an attachment (image-1.png, diagram-1.png) or of an external image.
  fileUrl: (name: string) => string;
  openDiagram: (diagram: string) => void;
}

// Node views render inside the editor's React tree, so they read the doc's files from context.
export const DocFilesContext = createContext<DocFiles>({ fileUrl: (n) => n, openDiagram: () => {} });

export const PANEL_KINDS = ['info', 'note', 'warning'] as const;

function PanelView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const params = node.attrs.params as string | null;
  return (
    <NodeViewWrapper className={`panel panel-${node.attrs.kind} visual-panel`}>
      <div className="visual-panel-head" contentEditable={false}>
        <input
          className="visual-panel-title"
          placeholder="Panel title (optional)"
          value={panelTitle(params)}
          onChange={(e) => updateAttributes({ params: withPanelTitle(params, e.target.value) })}
        />
        <select aria-label="Panel type" value={node.attrs.kind} onChange={(e) => updateAttributes({ kind: e.target.value })}>
          {PANEL_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="button" title="Remove panel" onClick={deleteNode}>
          ✕
        </button>
      </div>
      <NodeViewContent className="panel-body" />
    </NodeViewWrapper>
  );
}

// {info}/{note}/{warning}; params keep title= and anything else the macro had.
const Panel = Node.create({
  name: 'panel',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({ kind: { default: 'info' }, params: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-wiki-panel]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-wiki-panel': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(PanelView),
});

function DiagramView({ node, selected }: NodeViewProps) {
  const { fileUrl, openDiagram } = useContext(DocFilesContext);
  const name = node.attrs.name as string;
  return (
    <NodeViewWrapper className={`visual-diagram${selected ? ' selected' : ''}`} data-drag-handle>
      <img className="wiki-diagram" src={fileUrl(`${name}.png`)} alt={name} title="Double-click to edit" onDoubleClick={() => openDiagram(name)} />
      <button type="button" className="btn visual-diagram-edit" contentEditable={false} onClick={() => openDiagram(name)}>
        Edit diagram
      </button>
    </NodeViewWrapper>
  );
}

// The {info}MERMAID → diagram-N.mmd{info} placeholder, shown as the diagram's PNG.
const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ name: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-wiki-diagram]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-wiki-diagram': '' })],
  addNodeView: () => ReactNodeViewRenderer(DiagramView),
});

function ImageView({ node, selected }: NodeViewProps) {
  const { fileUrl } = useContext(DocFilesContext);
  return (
    <NodeViewWrapper as="span" className={`visual-image${selected ? ' selected' : ''}`}>
      <img className="wiki-image" src={fileUrl(node.attrs.name)} alt={node.attrs.name} />
    </NodeViewWrapper>
  );
}

// !image-N.png! (params such as |width=300 are kept).
const WikiImage = Node.create({
  name: 'wikiImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({ name: { default: null }, params: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-wiki-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-wiki-image': '' })],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
});

function RawView({ node, updateAttributes, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={`visual-raw${selected ? ' selected' : ''}`}>
      <div className="visual-raw-label" contentEditable={false}>
        Wiki markup the visual editor doesn't know, kept as is
      </div>
      <textarea spellCheck={false} value={node.attrs.text} onChange={(e) => updateAttributes({ text: e.target.value })} />
    </NodeViewWrapper>
  );
}

// A block macro the editor doesn't model ({toc}, {expand}…), written back verbatim.
const RawWiki = Node.create({
  name: 'rawWiki',
  group: 'block',
  atom: true,
  addAttributes: () => ({ text: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-wiki-raw]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-wiki-raw': '' })],
  addNodeView: () => ReactNodeViewRenderer(RawView),
});

// {code:params}: the params (e.g. a language) ride along on the code block.
const CodeParams = Extension.create({
  name: 'codeParams',
  addGlobalAttributes: () => [{ types: ['codeBlock'], attributes: { params: { default: null } } }],
});

// Shortcuts a wiki writer types: "h2. " makes a heading, "# " a numbered list ("* " and "1. " come with the lists).
const WikiInputRules = Extension.create({
  name: 'wikiInputRules',
  addInputRules(): InputRule[] {
    const { schema } = this.editor;
    return [
      textblockTypeInputRule({ find: /^h([1-6])\.\s$/, type: schema.nodes.heading, getAttributes: (m) => ({ level: Number(m[1]) }) }),
      wrappingInputRule({ find: /^#\s$/, type: schema.nodes.orderedList }),
    ];
  },
});

export const EXTENSIONS = [
  StarterKit.configure({
    // Not in the wiki subset the export writes (docs/spec.md > Docs > Editor).
    blockquote: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
  }),
  TableKit.configure({ table: { resizable: false } }),
  Panel,
  Diagram,
  WikiImage,
  RawWiki,
  CodeParams,
  WikiInputRules,
];

// Markdown shortcuts such as "# " for a heading or *x* for italic would fight wiki habits, so only these run.
export const INPUT_RULE_EXTENSIONS = ['bulletList', 'orderedList', 'codeBlock', 'wikiInputRules'];
export const PASTE_RULE_EXTENSIONS = ['link'];
