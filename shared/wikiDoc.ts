// Confluence wiki markup <-> the Docs visual editor's document (TipTap/ProseMirror JSON). Pure, so tests run it
// without a DOM. It reads the subset renderWiki renders; a block macro it doesn't know ({toc}, {expand}…) becomes a
// raw block that is written back verbatim. Everything else is regenerated, so the markup is normalized after an
// edit in the visual editor (see docs/spec.md > Docs > Editor).

import { diagramPlaceholder, MERGE_LEFT, MERGE_UP, resolveMerges, splitTableRow, type WikiCell } from './wikiMarkup';

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// The shape of TipTap's JSONContent, limited to what this file reads and writes.
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: DocMark[];
  text?: string;
}

const PANELS = new Set(['info', 'note', 'warning']);
// A block macro at the start of a line: {name} or {name:params}. {{mono}}, {*} and {_} don't match.
const MACRO_OPEN_RE = /^\{([a-zA-Z][\w-]*)(?::([^}]*))?\}/;
const DIAGRAM_RE = /^MERMAID → (diagram-\d+)\.mmd$/;
const HEADING_RE = /^h([1-6])\.\s+(.*)$/;
const LIST_RE = /^([#*]+)\s(.*)$/;
const SAFE_URL_RE = /^(?:https?|ftp|mailto):/i;
const BARE_URL_START_RE = /^(?:https?|ftp):\/\//i;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

// Panel params look like "title=Heads up|icon=false".
export function panelTitle(params: string | null): string {
  return /(?:^|\|)title=([^|]*)/.exec(params ?? '')?.[1] ?? '';
}

// Replaces the title in panel params; the characters that would end the macro or the param are dropped.
export function withPanelTitle(params: string | null, title: string): string | null {
  const rest = (params ?? '').split('|').filter((p) => p !== '' && !p.startsWith('title='));
  const clean = title.replace(/[|{}]/g, '');
  const all = clean ? [`title=${clean}`, ...rest] : rest;
  return all.length ? all.join('|') : null;
}

// --- wiki -> document

export function wikiToDoc(markup: string): DocNode {
  const content = parseBlocks(markup.replace(/\r\n?/g, '\n'));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

const paragraph = (content: DocNode[]): DocNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });

function parseBlocks(text: string): DocNode[] {
  const lines = text.split('\n');
  const out: DocNode[] = [];
  let para: string[] = [];
  let rows: WikiCell[][] = [];
  // Open list levels, outermost first. The outermost list is already in `out`.
  let lists: { marker: string; list: DocNode }[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const content: DocNode[] = [];
    para.forEach((line, i) => {
      if (i) content.push({ type: 'hardBreak' });
      content.push(...parseInline(line));
    });
    out.push(paragraph(content));
    para = [];
  };
  const flushTable = () => {
    if (rows.length) out.push(parseTable(rows));
    rows = [];
  };
  const flushAll = () => {
    flushPara();
    flushTable();
    lists = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const macro = MACRO_OPEN_RE.exec(line);
    if (macro) {
      const [open, name, params] = macro;
      const known = name === 'code' || PANELS.has(name);
      const rest = [line.slice(open.length), ...lines.slice(i + 1)].join('\n');
      const closeAt = rest.indexOf(`{${name}}`);
      if (closeAt !== -1 || !known) {
        flushAll();
        if (closeAt === -1) {
          // A macro without a body, e.g. {toc}.
          out.push({ type: 'rawWiki', attrs: { text: line } });
          continue;
        }
        const body = rest.slice(0, closeAt);
        const consumed = rest.slice(0, closeAt + name.length + 2);
        const extraLines = consumed.split('\n').length - 1;
        // Text after the closing tag on its line is parsed as the next line.
        const trailing = rest.slice(consumed.length).split('\n')[0];
        out.push(macroBlock(name, params, body, open + consumed));
        i += extraLines;
        if (trailing.trim() !== '') {
          lines[i] = trailing;
          i--;
        }
        continue;
      }
    }

    if (line.trimStart().startsWith('|')) {
      flushPara();
      lists = [];
      rows.push(splitTableRow(line.trim()));
      continue;
    }
    flushTable();

    const list = LIST_RE.exec(line);
    if (list) {
      flushPara();
      const markers = list[1];
      let common = 0;
      while (common < lists.length && common < markers.length && lists[common].marker === markers[common]) common++;
      lists = lists.slice(0, common);
      for (const marker of markers.slice(common)) {
        const node: DocNode = { type: marker === '#' ? 'orderedList' : 'bulletList', content: [] };
        const parent = lists.at(-1);
        if (!parent) out.push(node);
        else {
          // A level skipped in the markup (# then #**) gets an empty item to hang from.
          if (!parent.list.content!.length) parent.list.content!.push({ type: 'listItem', content: [paragraph([])] });
          parent.list.content!.at(-1)!.content!.push(node);
        }
        lists.push({ marker, list: node });
      }
      lists.at(-1)!.list.content!.push({ type: 'listItem', content: [paragraph(parseInline(list[2]))] });
      continue;
    }
    lists = [];

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      out.push({ type: 'heading', attrs: { level: Number(heading[1]) }, content: parseInline(heading[2]) });
    } else if (line.trim() === '') {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushAll();
  return out;
}

function macroBlock(name: string, params: string | undefined, body: string, raw: string): DocNode {
  if (name === 'code') {
    const code = body.replace(/^\n/, '').replace(/\n$/, '');
    return { type: 'codeBlock', attrs: { params: params ?? null }, ...(code && { content: [{ type: 'text', text: code }] }) };
  }
  if (PANELS.has(name)) {
    const diagram = DIAGRAM_RE.exec(body.trim());
    if (diagram) return { type: 'diagram', attrs: { name: diagram[1] } };
    const content = parseBlocks(body.trim());
    return { type: 'panel', attrs: { kind: name, params: params ?? null }, content: content.length ? content : [paragraph([])] };
  }
  return { type: 'rawWiki', attrs: { text: raw } };
}

// ⇐/⇑ marker cells become colspan/rowspan, as in the preview; markers that don't form rectangles stay text.
function parseTable(rows: WikiCell[][]): DocNode {
  const cells = resolveMerges(rows) ?? rows.map((row) => row.map((c) => ({ ...c, colspan: 1, rowspan: 1 })));
  return {
    type: 'table',
    content: cells.map((row) => ({
      type: 'tableRow',
      content: row.map(({ header, text, colspan, rowspan }) => ({
        type: header ? 'tableHeader' : 'tableCell',
        ...((colspan > 1 || rowspan > 1) && { attrs: { colspan, rowspan } }),
        content: [paragraph(parseInline(text))],
      })),
    })),
  };
}

interface InlineRule {
  re: RegExp;
  // Returns null to reject this match (e.g. an unsafe link target), so the text stays plain.
  make: (m: RegExpExecArray, marks: DocMark[]) => DocNode[] | null;
}

const withMark = (marks: DocMark[], mark: DocMark) => [...marks, mark];

// Earlier rules win ties. Mono, images and links come first so bold/italic never reach inside them.
const INLINE_RULES: InlineRule[] = [
  { re: /\{\{(.+?)\}\}/g, make: (m) => [{ type: 'text', text: m[1], marks: [{ type: 'code' }] }] },
  {
    re: /!([^\s!|]+\.(?:png|jpe?g|gif|svg|webp))(?:\|([^!\n]*))?!/gi,
    make: (m) => [{ type: 'wikiImage', attrs: { name: m[1], params: m[2] ?? null } }],
  },
  {
    re: /\[(?:([^\]|]*)\|)?([^\]|]+)\]/g,
    make: (m, marks) => {
      const href = m[2].trim();
      return SAFE_URL_RE.test(href) ? parseInline(m[1] ?? href, withMark(marks, { type: 'link', attrs: { href } })) : null;
    },
  },
  {
    re: /\b(?:https?|ftp):\/\/[^\s<>"'\]|]+/g,
    make: (m, marks) => [{ type: 'text', text: m[0], marks: withMark(marks, { type: 'link', attrs: { href: m[0] } }) }],
  },
  { re: /\{\*\}(.+?)\{\*\}/g, make: (m, marks) => parseInline(m[1], withMark(marks, { type: 'bold' })) },
  { re: /(?<![\p{L}\p{N}*])\*(?=\S)([^*]*?\S)\*(?![\p{L}\p{N}])/gu, make: (m, marks) => parseInline(m[1], withMark(marks, { type: 'bold' })) },
  { re: /\{_\}(.+?)\{_\}/g, make: (m, marks) => parseInline(m[1], withMark(marks, { type: 'italic' })) },
  { re: /(?<![\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}])/gu, make: (m, marks) => parseInline(m[1], withMark(marks, { type: 'italic' })) },
];

function parseInline(text: string, marks: DocMark[] = []): DocNode[] {
  const out: DocNode[] = [];
  const pushText = (t: string) => {
    if (t) out.push(marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t });
  };
  let pos = 0;
  while (pos < text.length) {
    let best: { m: RegExpExecArray; nodes: DocNode[] } | null = null;
    for (const rule of INLINE_RULES) {
      rule.re.lastIndex = pos;
      for (let m = rule.re.exec(text); m && (!best || m.index < best.m.index); m = rule.re.exec(text)) {
        const nodes = rule.make(m, marks);
        if (nodes) {
          best = { m, nodes };
          break;
        }
      }
    }
    if (!best) break;
    pushText(text.slice(pos, best.m.index));
    out.push(...best.nodes);
    pos = best.m.index + best.m[0].length;
  }
  pushText(text.slice(pos));
  return mergeText(out);
}

const sameMarks = (a: DocMark[] = [], b: DocMark[] = []) =>
  a.length === b.length && a.every((m, i) => m.type === b[i].type && m.attrs?.href === b[i].attrs?.href);

function mergeText(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  for (const node of nodes) {
    const prev = out.at(-1);
    if (prev?.type === 'text' && node.type === 'text' && sameMarks(prev.marks, node.marks)) {
      out[out.length - 1] = { ...prev, text: prev.text! + node.text! };
    } else out.push(node);
  }
  return out;
}

// --- document -> wiki

export function docToWiki(doc: DocNode): string {
  return serializeBlocks(doc.content ?? []);
}

// A blank line between blocks keeps adjacent paragraphs, lists and tables apart.
function serializeBlocks(nodes: DocNode[]): string {
  return nodes
    .map(serializeBlock)
    .filter((s) => s !== '')
    .join('\n\n');
}

const param = (params: unknown) => (typeof params === 'string' && params !== '' ? `:${params}` : '');

function serializeBlock(node: DocNode): string {
  const content = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return serializeInline(content);
    case 'heading':
      return `h${node.attrs?.level ?? 1}. ${serializeInline(content, ' ')}`;
    case 'bulletList':
    case 'orderedList':
      return serializeList(node, '').join('\n');
    case 'table':
      return serializeTable(node);
    case 'codeBlock':
      return `{code${param(node.attrs?.params)}}\n${content.map((t) => t.text ?? '').join('')}\n{code}`;
    case 'panel': {
      const kind = String(node.attrs?.kind ?? 'info');
      return `{${kind}${param(node.attrs?.params)}}\n${serializeBlocks(content)}\n{${kind}}`;
    }
    case 'diagram':
      return diagramPlaceholder(String(node.attrs?.name));
    case 'rawWiki':
      return String(node.attrs?.text ?? '');
    default:
      return '';
  }
}

// Wiki list items are single lines: line breaks become spaces, and other blocks in an item become sibling items.
function serializeList(list: DocNode, prefix: string): string[] {
  const markers = prefix + (list.type === 'orderedList' ? '#' : '*');
  const lines: string[] = [];
  for (const item of list.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') lines.push(...serializeList(child, markers));
      else if (child.type === 'paragraph') lines.push(`${markers} ${serializeInline(child.content ?? [], ' ')}`);
      else lines.push(`${markers} ${serializeBlock(child).replace(/\n/g, ' ')}`);
    }
  }
  return lines;
}

// Lays the cells out on the full grid (a merged cell occupies several slots) and writes ⇐/⇑ into the slots a merge
// covers, so every wiki row has every column.
function serializeTable(table: DocNode): string {
  const grid: WikiCell[][] = [];
  (table.content ?? []).forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of row.content ?? []) {
      while (grid[r][c]) c++;
      const header = cell.type === 'tableHeader';
      const colspan = Number(cell.attrs?.colspan ?? 1);
      const rowspan = Number(cell.attrs?.rowspan ?? 1);
      const text = (cell.content ?? []).map((p) => serializeInline(p.content ?? [], ' ')).join(' ');
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) {
          const mark = dr === 0 || dc > 0 ? MERGE_LEFT : MERGE_UP;
          grid[r + dr][c + dc] = { header, text: dr === 0 && dc === 0 ? text : mark };
        }
      }
      c += colspan;
    }
  });
  return grid
    .map((row) => {
      // A slot no cell reached (a ragged table) is written as an empty body cell.
      const cells = Array.from(row, (cell) => cell ?? { header: false, text: '' });
      // An empty cell needs a space: "||" would read as a header marker.
      const line = cells.map((cell) => (cell.header ? '||' : '|') + (cell.text === '' ? ' ' : cell.text)).join('');
      return line + (cells.at(-1)?.header ? '||' : '|');
    })
    .join('\n');
}

// Marks nest in this order: a link outermost, mono innermost.
const MARK_ORDER = ['link', 'bold', 'italic', 'code'] as const;
type MarkType = (typeof MARK_ORDER)[number];

interface Segment {
  text: string;
  // Images and line breaks: written as is, never wrapped in marks.
  atom: boolean;
  marks: DocMark[];
}

interface Piece {
  text: string;
  mark?: MarkType;
  href?: string;
}

function serializeInline(nodes: DocNode[], lineBreak = '\n'): string {
  const segments: Segment[] = nodes.map((n) => {
    if (n.type === 'text') return { text: n.text ?? '', atom: false, marks: n.marks ?? [] };
    if (n.type === 'hardBreak') return { text: lineBreak, atom: true, marks: [] };
    if (n.type === 'wikiImage') {
      const params = n.attrs?.params ? `|${n.attrs.params}` : '';
      return { text: `!${n.attrs?.name}${params}!`, atom: true, marks: [] };
    }
    return { text: '', atom: true, marks: [] };
  });
  return renderSegments(segments, 0);
}

// Groups consecutive segments by the mark at `level` and wraps each marked run, then recurses into the next mark.
function renderSegments(segments: Segment[], level: number): string {
  if (level === MARK_ORDER.length) return segments.map((s) => s.text).join('');
  const type = MARK_ORDER[level];
  const pieces: Piece[] = [];
  let run: Segment[] = [];
  let runKey: string | null = null;
  const flush = () => {
    if (!run.length) return;
    const text = renderSegments(run, level + 1);
    pieces.push(runKey === null ? { text } : { text, mark: type, href: runKey });
    run = [];
  };
  for (const s of segments) {
    const mark = s.atom ? undefined : s.marks.find((m) => m.type === type);
    const key = mark ? String(mark.attrs?.href ?? '') : null;
    if (key !== runKey) flush();
    runKey = key;
    run.push(s);
  }
  flush();
  return joinPieces(pieces);
}

const isBareLink = (p: Piece) => p.mark === 'link' && p.text === p.href && BARE_URL_START_RE.test(p.href);

// The first character a piece shows once written. Marker syntax never starts with a word character, a bare URL does.
function firstChar(p: Piece): string {
  if (!p.mark || isBareLink(p)) return p.text[0] ?? '';
  return /^\s/.test(p.text) ? p.text[0] : '*';
}

function joinPieces(pieces: Piece[]): string {
  let out = '';
  pieces.forEach((p, i) => {
    if (!p.mark) {
      out += p.text;
      return;
    }
    // Whitespace at a mark's edges goes outside it: "* bold*" is not bold.
    const lead = /^\s*/.exec(p.text)![0];
    const trail = /\s*$/.exec(p.text)![0];
    const core = p.text.slice(lead.length, p.text.length - trail.length);
    if (core === '') {
      out += p.text;
      return;
    }
    out += lead;
    if (p.mark === 'link') {
      if (isBareLink(p)) out += core;
      else out += core === p.href ? `[${p.href}]` : `[${core}|${p.href}]`;
    } else if (p.mark === 'code') {
      out += `{{${core}}}`;
    } else {
      const marker = p.mark === 'bold' ? '*' : '_';
      const before = out.at(-1) ?? '';
      const after = trail[0] ?? (pieces[i + 1] ? firstChar(pieces[i + 1]) : '');
      // The short form only works at word boundaries and can't contain its own marker.
      const braces = WORD_CHAR_RE.test(before) || WORD_CHAR_RE.test(after) || core.includes(marker);
      out += braces ? `{${marker}}${core}{${marker}}` : `${marker}${core}${marker}`;
    }
    out += trail;
  });
  return out;
}
