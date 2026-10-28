// Jira/Confluence wiki markup -> HTML for previews (Tests steps and Docs).
// Covers the subset listed in docs/spec.md; anything else renders as plain text.

export interface RenderOptions {
  // Maps an attachment name (image-1.png) to a URL. Without it, !image! references stay plain text.
  imageUrl?: (name: string) => string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// {code} bodies are opaque; panel bodies are rendered recursively.
const MACRO_RE = /\{code(?::[^}]*)?\}([\s\S]*?)\{code\}|\{(info|note|warning)(?::([^}]*))?\}([\s\S]*?)\{\2\}/g;
// The Docs placeholder for a diagram drawn on the canvas (see docs/spec.md > Diagrams).
const DIAGRAM_RE = /^MERMAID → (diagram-\d+)\.mmd$/;
const HEADING_RE = /^h([1-6])\.\s+(.*)$/;
const LIST_RE = /^([#*]+)\s(.*)$/;
const IMAGE_RE = /!([^\s!|]+\.(?:png|jpe?g|gif|svg|webp))(?:\|[^!\n]*)?!/gi;
const LINK_RE = /\[(?:([^\]|]*)\|)?([^\]|]+)\]/g;
const BARE_URL_RE = /\b(?:https?|ftp):\/\/[^\s<>"'\]|]+/g;
const SAFE_URL_RE = /^(?:https?|ftp|mailto):/i;
// Jira only treats * and _ as markers at word boundaries, so MAX_RETRY_COUNT stays plain.
const BOLD_RE = /(?<![\p{L}\p{N}*])\*(?=\S)([^*]*?\S)\*(?![\p{L}\p{N}])/gu;
const ITALIC_RE = /(?<![\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}])/gu;

export function renderWiki(markup: string, options: RenderOptions = {}): string {
  return renderMacros(markup.replace(/\r\n?/g, '\n'), options);
}

export function diagramPlaceholder(diagram: string): string {
  return `{info}MERMAID → ${diagram}.mmd{info}`;
}

const CODE_BLOCK_RE = /\{code(?::[^}]*)?\}[\s\S]*?\{code\}/g;
const PLACEHOLDER_RE = /\{info(?::[^}]*)?\}\s*MERMAID → (diagram-\d+)\.mmd\s*\{info\}/g;

// Attachments the markup points at: !images! and, for each diagram placeholder, its .mmd/.png/.json.
// Code blocks and external image URLs don't count.
export function referencedFiles(markup: string): string[] {
  const text = markup.replace(CODE_BLOCK_RE, '');
  const names = new Set<string>();
  for (const m of text.matchAll(IMAGE_RE)) {
    if (!/[/:]/.test(m[1])) names.add(m[1]);
  }
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    for (const ext of ['mmd', 'png', 'json']) names.add(`${m[1]}.${ext}`);
  }
  return [...names];
}

function renderMacros(text: string, options: RenderOptions): string {
  let html = '';
  let last = 0;
  for (const m of text.matchAll(MACRO_RE)) {
    html += renderBlocks(text.slice(last, m.index), options);
    html += m[2] === undefined ? renderCode(m[1]) : renderPanel(m[2], m[3], m[4], options);
    last = m.index + m[0].length;
  }
  return html + renderBlocks(text.slice(last), options);
}

function renderCode(body: string): string {
  const code = body.replace(/^\n/, '').replace(/\n$/, '');
  return `<pre class="wiki-code"><code>${escapeHtml(code)}</code></pre>`;
}

function renderPanel(kind: string, params: string | undefined, body: string, options: RenderOptions): string {
  const diagram = DIAGRAM_RE.exec(body.trim());
  if (diagram && options.imageUrl) {
    const name = diagram[1];
    return `<img class="wiki-diagram" data-diagram="${name}" src="${escapeHtml(options.imageUrl(`${name}.png`))}" alt="${name}">`;
  }
  const title = /(?:^|\|)title=([^|]*)/.exec(params ?? '')?.[1];
  const head = title ? `<div class="panel-title">${escapeHtml(title)}</div>` : '';
  return `<div class="panel panel-${kind}">${head}<div class="panel-body">${renderMacros(body.trim(), options)}</div></div>`;
}

const listTag = (marker: string) => (marker === '#' ? 'ol' : 'ul');

function renderBlocks(text: string, options: RenderOptions): string {
  const out: string[] = [];
  let para: string[] = [];
  let tableRows: WikiCell[][] = [];
  // Marker of each open list level, outermost first; every open level has an open <li>.
  const stack: string[] = [];
  const inline = (s: string) => renderInline(s, options);

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeLists = (depth: number) => {
    while (stack.length > depth) out.push(`</li></${listTag(stack.pop()!)}>`);
  };
  const flushTable = () => {
    if (tableRows.length) out.push(renderTable(tableRows, inline));
    tableRows = [];
  };

  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('|')) {
      flushPara();
      closeLists(0);
      tableRows.push(splitTableRow(line.trim()));
      continue;
    }
    flushTable();

    const list = LIST_RE.exec(line);
    if (list) {
      flushPara();
      const markers = list[1];
      let common = 0;
      while (common < stack.length && common < markers.length && stack[common] === markers[common]) common++;
      closeLists(common);
      if (common === markers.length) out.push('</li><li>');
      for (const marker of markers.slice(common)) {
        out.push(`<${listTag(marker)}><li>`);
        stack.push(marker);
      }
      out.push(inline(list[2]));
      continue;
    }
    closeLists(0);

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      out.push(`<h${heading[1]}>${inline(heading[2])}</h${heading[1]}>`);
    } else if (line.trim() === '') {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushTable();
  closeLists(0);
  flushPara();
  return out.join('');
}

export interface WikiCell {
  header: boolean;
  text: string;
}

export interface SpannedCell extends WikiCell {
  colspan: number;
  rowspan: number;
}

// Wiki markup has no merged cells, so the mock marks them (docs/spec.md > Docs > Editor): a cell that is exactly ⇐
// belongs to the cell on its left, ⇑ to the cell above. The top row of a merge uses ⇐, the first column below it ⇑,
// the rest ⇐.
export const MERGE_LEFT = '⇐';
export const MERGE_UP = '⇑';

// Turns marker cells into colspan/rowspan on the cell they merge into and drops them. Returns null when the markers
// don't form rectangles; the caller then shows them as plain text.
export function resolveMerges(rows: WikiCell[][]): SpannedCell[][] | null {
  const cells: SpannedCell[][] = rows.map((row) => row.map((c) => ({ ...c, colspan: 1, rowspan: 1 })));
  // The top-left cell each position belongs to; null for a cell that is its own.
  const owner: ([number, number] | null)[][] = rows.map((row) => row.map(() => null));
  const ownerOf = (r: number, c: number): [number, number] => owner[r][c] ?? [r, c];
  let merged = false;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const text = rows[r][c].text;
      if (text === MERGE_LEFT) {
        if (c === 0) return null;
        owner[r][c] = ownerOf(r, c - 1);
      } else if (text === MERGE_UP) {
        if (r === 0 || c >= rows[r - 1].length) return null;
        owner[r][c] = ownerOf(r - 1, c);
      } else continue;
      merged = true;
    }
  }
  if (!merged) return cells;

  const groups = new Map<string, [number, number][]>();
  owner.forEach((row, r) =>
    row.forEach((o, c) => {
      if (!o) return;
      const key = o.join(',');
      groups.set(key, [...(groups.get(key) ?? [o]), [r, c]]);
    }),
  );
  for (const positions of groups.values()) {
    const [top, left] = positions[0];
    const bottom = Math.max(...positions.map(([r]) => r));
    const right = Math.max(...positions.map(([, c]) => c));
    const inside = positions.every(([r, c]) => r >= top && c >= left);
    if (!inside || positions.length !== (bottom - top + 1) * (right - left + 1)) return null;
    cells[top][left].rowspan = bottom - top + 1;
    cells[top][left].colspan = right - left + 1;
  }
  return cells.map((row, r) => row.filter((_, c) => !owner[r][c]));
}

const TABLE_LINE_RE = /^\s*\|/;

export interface MergedTable {
  // Position among all tables in the doc, from 1.
  table: number;
  merges: number;
  // The table's own lines, ready for renderWiki.
  markup: string;
}

// Tables whose cells are merged with ⇐/⇑ markers, numbered in document order.
export function tableMerges(markup: string): MergedTable[] {
  const lines = markup.replace(/\r\n?/g, '\n').replace(CODE_BLOCK_RE, '').split('\n');
  const found: MergedTable[] = [];
  let table = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!TABLE_LINE_RE.test(lines[i])) continue;
    const start = i;
    const rows: WikiCell[][] = [];
    for (; i < lines.length && TABLE_LINE_RE.test(lines[i]); i++) rows.push(splitTableRow(lines[i].trim()));
    table++;
    const merges = resolveMerges(rows)
      ?.flat()
      .filter((c) => c.colspan > 1 || c.rowspan > 1).length;
    if (merges) found.push({ table, merges, markup: lines.slice(start, i).join('\n') });
  }
  return found;
}

function renderTable(rows: WikiCell[][], inline: (s: string) => string): string {
  const cells = resolveMerges(rows) ?? rows.map((row) => row.map((c) => ({ ...c, colspan: 1, rowspan: 1 })));
  const html = cells.map((row) => {
    const tds = row.map(({ header, text, colspan, rowspan }) => {
      const tag = header ? 'th' : 'td';
      const spans = (colspan > 1 ? ` colspan="${colspan}"` : '') + (rowspan > 1 ? ` rowspan="${rowspan}"` : '');
      return `<${tag}${spans}>${inline(text)}</${tag}>`;
    });
    return `<tr>${tds.join('')}</tr>`;
  });
  return `<table class="wiki-table"><tbody>${html.join('')}</tbody></table>`;
}

// `||h||h||` is a header row, `|c|c|` a body row; they can mix. Pipes inside [links] and {{mono}} don't split cells.
// Cell text comes back trimmed.
export function splitTableRow(line: string): WikiCell[] {
  const cells: WikiCell[] = [];
  let current: { header: boolean; text: string } | null = null;
  let brackets = 0;
  let mono = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '|' && brackets === 0 && !mono) {
      if (current) cells.push(current);
      const header = line[i + 1] === '|';
      if (header) i++;
      current = { header, text: '' };
      continue;
    }
    if (line.startsWith('{{', i) || line.startsWith('}}', i)) {
      mono = line[i] === '{';
      current!.text += line.slice(i, i + 2);
      i++;
      continue;
    }
    if (c === '[') brackets++;
    else if (c === ']' && brackets > 0) brackets--;
    current!.text += c;
  }
  // Text after the last pipe is a final cell; a trailing pipe just closes the row.
  if (current && current.text.trim() !== '') cells.push(current);
  return cells.map((c) => ({ header: c.header, text: c.text.trim() }));
}

function link(url: string, label: string): string | null {
  if (!SAFE_URL_RE.test(url)) return null;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderInline(text: string, options: RenderOptions): string {
  // Mono, images and links are rendered first and parked, so bold/italic never touch their contents.
  const parked: string[] = [];
  const park = (html: string) => `\u0000${parked.push(html) - 1}\u0000`;

  let t = text.replace(/\{\{(.+?)\}\}/g, (_, mono: string) => park(`<code>${escapeHtml(mono)}</code>`));
  if (options.imageUrl) {
    const imageUrl = options.imageUrl;
    t = t.replace(IMAGE_RE, (_, name: string) =>
      park(`<img class="wiki-image" src="${escapeHtml(imageUrl(name))}" alt="${escapeHtml(name)}">`),
    );
  }
  t = t.replace(LINK_RE, (whole, label: string | undefined, url: string) => {
    const html = link(url.trim(), label ?? url.trim());
    return html ? park(html) : whole;
  });
  t = t.replace(BARE_URL_RE, (url) => park(link(url, url)!));
  t = escapeHtml(t);
  t = t.replace(/\{\*\}(.+?)\{\*\}/g, '<strong>$1</strong>');
  t = t.replace(/\{_\}(.+?)\{_\}/g, '<em>$1</em>');
  t = t.replace(BOLD_RE, '<strong>$1</strong>');
  t = t.replace(ITALIC_RE, '<em>$1</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => parked[Number(i)]);
}
