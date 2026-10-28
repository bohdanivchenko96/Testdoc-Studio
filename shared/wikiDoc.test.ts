import { describe, expect, it } from 'vitest';
import { docToWiki, panelTitle, wikiToDoc, withPanelTitle, type DocNode } from './wikiDoc';
import { renderWiki } from './wikiMarkup';

const roundTrip = (markup: string) => docToWiki(wikiToDoc(markup));
const text = (t: string, ...marks: DocNode['marks'] & object): DocNode => (marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });

const CORPUS = [
  'h2. Test title\nh3. test title h3\n{info}\nTest INFO\n{info}\n{note}\nTEST NOTE\n{note}\n{warning}\nTEST WARNING\n{warning}\n{{test example of code}}\n\n||test header||Header||\n|Cell|Cell|\n{info}MERMAID → diagram-1.mmd{info}\n\n!image-2.png!\n* sadas\n* asdas\n* asd',
  'one\ntwo\n\nthree',
  '# a\n#* b\n#* c\n# d\n\n* x\n** y',
  '# a\n#** b\n* c',
  'is *set* and {*}x{*}y, _note_ for MAX_RETRY_COUNT, {{a*b*c}}',
  '[Docs|https://x.io/a_b_c] and https://y.io/*z* and [https://z.io]',
  '[x|javascript:alert(1)]',
  'before\n{code:json}\n{"a": "<b>"}\n*not bold*\n{code}\nafter',
  '{note:title=Heads up}\n* one\n* *two*\n{note}',
  '||A||B||\n| |x|\n|[a|https://a.io]|{{p|q}}|',
  '!image-1.png|width=300! and !https://x.io/a.png!',
  'a b',
  'h1. *Bold* _it_ title',
  '||Name||⇐||Type||\n|a|⇐|x|\n|⇑|⇐|y|\n|b|c|⇑|',
  '|⇐|not a merge|',
];

describe('wikiToDoc / docToWiki', () => {
  it.each(CORPUS)('keeps the preview identical: %j', (markup) => {
    expect(renderWiki(roundTrip(markup), { imageUrl: (n) => n })).toBe(renderWiki(markup, { imageUrl: (n) => n }));
  });

  it.each(CORPUS)('is stable after the first pass: %j', (markup) => {
    const once = roundTrip(markup);
    expect(roundTrip(once)).toBe(once);
  });

  it('parses the Docs blocks', () => {
    expect(wikiToDoc('h2. T\n{info:title=Hi}\nx\n{info}\n{warning}MERMAID → diagram-3.mmd{warning}\n{code}\na\n{code}')).toEqual(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('T')] },
        { type: 'panel', attrs: { kind: 'info', params: 'title=Hi' }, content: [p(text('x'))] },
        { type: 'diagram', attrs: { name: 'diagram-3' } },
        { type: 'codeBlock', attrs: { params: null }, content: [text('a')] },
      ),
    );
  });

  it('parses nested marks and images', () => {
    expect(wikiToDoc('*a _b_* !image-1.png!').content![0]).toEqual(
      p(
        text('a ', { type: 'bold' }),
        text('b', { type: 'bold' }, { type: 'italic' }),
        text(' '),
        { type: 'wikiImage', attrs: { name: 'image-1.png', params: null } },
      ),
    );
  });

  it('writes panels and code on their own lines and separates blocks with a blank line', () => {
    expect(roundTrip('h2. T\n{info}x{info}\n{code:js}a{code}\npara')).toBe('h2. T\n\n{info}\nx\n{info}\n\n{code:js}\na\n{code}\n\npara');
  });

  it('keeps unknown block macros verbatim, including their bodies', () => {
    const markup = '{toc:maxLevel=2}\n\n{expand:title=More}\n* raw   list\n\n{color:red}x{color}\n{expand}\n\ntext';
    expect(roundTrip(markup)).toBe(markup);
    expect(wikiToDoc(markup).content!.map((n) => n.type)).toEqual(['rawWiki', 'rawWiki', 'paragraph']);
  });
});

describe('panel title params', () => {
  it('reads and replaces the title, keeping other params', () => {
    expect(panelTitle('icon=false|title=Hi')).toBe('Hi');
    expect(withPanelTitle('icon=false|title=Hi', 'New {x|y}')).toBe('title=New xy|icon=false');
    expect(withPanelTitle('title=Hi', '')).toBeNull();
    expect(withPanelTitle(null, 'T')).toBe('title=T');
  });
});

describe('docToWiki: marks', () => {
  it('uses {*} and {_} next to word characters', () => {
    expect(docToWiki(doc(p(text('foo'), text('bar', { type: 'bold' }), text(' x '), text('it', { type: 'italic' }), text('s'))))).toBe(
      'foo{*}bar{*} x {_}it{_}s',
    );
  });

  it('moves whitespace outside marks', () => {
    expect(docToWiki(doc(p(text('a'), text(' bold ', { type: 'bold' }), text('b'))))).toBe('a *bold* b');
  });

  it('nests overlapping marks properly', () => {
    expect(docToWiki(doc(p(text('a', { type: 'bold' }), text('b', { type: 'bold' }, { type: 'italic' }), text('c', { type: 'italic' }))))).toBe(
      '*a{_}b{_}*_c_',
    );
  });

  it('writes links, mono and line breaks', () => {
    const link = { type: 'link', attrs: { href: 'https://x.io', target: '_blank' } };
    expect(
      docToWiki(doc(p(text('see '), text('docs', link), { type: 'hardBreak' }, text('https://x.io', link), text(' and '), text('v1', { type: 'code' })))),
    ).toBe('see [docs|https://x.io]\nhttps://x.io and {{v1}}');
  });

  it('writes lists with nested markers and tables with header cells', () => {
    const item = (s: string, ...rest: DocNode[]): DocNode => ({ type: 'listItem', content: [p(text(s)), ...rest] });
    const cell = (type: string, s: string): DocNode => ({ type, content: [s ? p(text(s)) : { type: 'paragraph' }] });
    expect(
      docToWiki(
        doc(
          { type: 'orderedList', content: [item('a', { type: 'bulletList', content: [item('b')] }), item('c')] },
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [cell('tableHeader', 'H1'), cell('tableHeader', 'H2')] },
              { type: 'tableRow', content: [cell('tableCell', ''), cell('tableCell', 'x')] },
            ],
          },
        ),
      ),
    ).toBe('# a\n#* b\n# c\n\n||H1||H2||\n| |x|');
  });

  it('turns merge markers into spans and writes them back', () => {
    const markup = '||Name||⇐||\n|a|b|\n|⇑|c|';
    const rows = wikiToDoc(markup).content![0].content!;
    expect(rows.map((r) => r.content!.map((c) => c.attrs ?? null))).toEqual([[{ colspan: 2, rowspan: 1 }], [{ colspan: 1, rowspan: 2 }, null], [null]]);
    expect(roundTrip(markup)).toBe(markup);
  });

  it('writes a 2x2 merge from editor spans', () => {
    const cell = (s: string, attrs?: Record<string, unknown>): DocNode => ({ type: 'tableCell', ...(attrs && { attrs }), content: [p(text(s))] });
    const table: DocNode = {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('a', { colspan: 2, rowspan: 2, colwidth: null }), cell('x')] },
        { type: 'tableRow', content: [cell('y')] },
      ],
    };
    expect(docToWiki(doc(table))).toBe('|a|⇐|x|\n|⇑|⇐|y|');
  });

  it('skips empty paragraphs', () => {
    expect(docToWiki(doc({ type: 'paragraph' }, p(text('a')), { type: 'paragraph' }))).toBe('a');
  });
});
