import { describe, expect, it } from 'vitest';
import { diagramPlaceholder, referencedFiles, renderWiki, tableMerges } from './wikiMarkup';

describe('referencedFiles', () => {
  it('lists images and every file of each diagram, ignoring code blocks', () => {
    const markup = `!image-1.png! text !image-1.png! !https://x.io/a.png!\n${diagramPlaceholder('diagram-2')}\n{code}!image-9.png!{code}\n!diagram-2.png!`;
    expect(referencedFiles(markup).sort()).toEqual(['diagram-2.json', 'diagram-2.mmd', 'diagram-2.png', 'image-1.png']);
  });
});

describe('renderWiki', () => {
  it('renders plain lines as one paragraph with line breaks', () => {
    expect(renderWiki('one\r\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('renders numbered lists with nested bullets', () => {
    expect(renderWiki('# a\n#* b\n#* c\n# d')).toBe(
      '<ol><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ol>',
    );
  });

  it('renders deeper nesting and switches list type at the same depth', () => {
    expect(renderWiki('# a\n#** b\n* c')).toBe(
      '<ol><li>a<ul><li><ul><li>b</li></ul></li></ul></li></ol><ul><li>c</li></ul>',
    );
  });

  it('ends a list at a plain line', () => {
    expect(renderWiki('# a\ntext')).toBe('<ol><li>a</li></ol><p>text</p>');
  });

  it('does not treat *bold* at line start as a bullet', () => {
    expect(renderWiki('*bold* text')).toBe('<p><strong>bold</strong> text</p>');
  });

  it('renders both bold forms', () => {
    expect(renderWiki('is *set* and {*}x{*}y')).toBe('<p>is <strong>set</strong> and <strong>x</strong>y</p>');
  });

  it('renders italic but leaves underscores inside identifiers alone', () => {
    expect(renderWiki('_note_ for MAX_RETRY_COUNT')).toBe('<p><em>note</em> for MAX_RETRY_COUNT</p>');
  });

  it('renders mono without applying bold inside it', () => {
    expect(renderWiki('{{a*b*c}}')).toBe('<p><code>a*b*c</code></p>');
  });

  it('renders code blocks verbatim and escaped', () => {
    expect(renderWiki('before\n{code:json}\n{"a": "<b>"}\n{code}\nafter')).toBe(
      '<p>before</p><pre class="wiki-code"><code>{&quot;a&quot;: &quot;&lt;b&gt;&quot;}</code></pre><p>after</p>',
    );
  });

  it('renders links', () => {
    expect(renderWiki('[Docs|https://x.io/a_b_c] and https://y.io/*z*')).toBe(
      '<p><a href="https://x.io/a_b_c" target="_blank" rel="noreferrer">Docs</a> and ' +
        '<a href="https://y.io/*z*" target="_blank" rel="noreferrer">https://y.io/*z*</a></p>',
    );
  });

  it('leaves unsafe link targets as text', () => {
    expect(renderWiki('[x|javascript:alert(1)]')).toBe('<p>[x|javascript:alert(1)]</p>');
  });

  it('escapes HTML', () => {
    expect(renderWiki("<img src=x onerror='1'>")).toBe('<p>&lt;img src=x onerror=&#39;1&#39;&gt;</p>');
  });

  it('keeps non-breaking spaces', () => {
    expect(renderWiki('a b')).toBe('<p>a b</p>');
  });
});

describe('renderWiki: Confluence blocks', () => {
  const imageUrl = (name: string) => `/files/${name}`;

  it('renders headings with inline markup', () => {
    expect(renderWiki('h1. Title\nh3. *Sub* part\ntext')).toBe('<h1>Title</h1><h3><strong>Sub</strong> part</h3><p>text</p>');
  });

  it('does not treat h7. or a missing space as a heading', () => {
    expect(renderWiki('h7. no\nh2.no')).toBe('<p>h7. no<br>h2.no</p>');
  });

  it('renders tables with header and body rows', () => {
    expect(renderWiki('||Name||Value||\n|a|*b*|\n|[x|https://x.io]|{{p|q}}|')).toBe(
      '<table class="wiki-table"><tbody>' +
        '<tr><th>Name</th><th>Value</th></tr>' +
        '<tr><td>a</td><td><strong>b</strong></td></tr>' +
        '<tr><td><a href="https://x.io" target="_blank" rel="noreferrer">x</a></td><td><code>p|q</code></td></tr>' +
        '</tbody></table>',
    );
  });

  it('renders a header column mixed with body cells, without a trailing pipe', () => {
    expect(renderWiki('||Key|value')).toBe('<table class="wiki-table"><tbody><tr><th>Key</th><td>value</td></tr></tbody></table>');
  });

  it('ends a table at a non-table line', () => {
    expect(renderWiki('|a|\nafter')).toBe('<table class="wiki-table"><tbody><tr><td>a</td></tr></tbody></table><p>after</p>');
  });

  it('renders panels with a title and nested markup', () => {
    expect(renderWiki('{note:title=Heads up}\n# one\n{code}x{code}\n{note}')).toBe(
      '<div class="panel panel-note"><div class="panel-title">Heads up</div><div class="panel-body">' +
        '<ol><li>one</li></ol><pre class="wiki-code"><code>x</code></pre></div></div>',
    );
  });

  it('renders single-line panels', () => {
    expect(renderWiki('{warning}Careful{warning}')).toBe(
      '<div class="panel panel-warning"><div class="panel-body"><p>Careful</p></div></div>',
    );
  });

  it('renders images only when imageUrl is given', () => {
    expect(renderWiki('see !image-1.png! and !image-2.png|width=300!', { imageUrl })).toBe(
      '<p>see <img class="wiki-image" src="/files/image-1.png" alt="image-1.png"> and ' +
        '<img class="wiki-image" src="/files/image-2.png" alt="image-2.png"></p>',
    );
    expect(renderWiki('see !image-1.png!')).toBe('<p>see !image-1.png!</p>');
  });

  it('does not treat exclamation marks in prose as images', () => {
    expect(renderWiki('Done! Next step!', { imageUrl })).toBe('<p>Done! Next step!</p>');
  });

  it('renders the diagram placeholder as its PNG in Docs and as a panel elsewhere', () => {
    const placeholder = '{info}MERMAID → diagram-2.mmd{info}';
    expect(renderWiki(placeholder, { imageUrl })).toBe(
      '<img class="wiki-diagram" data-diagram="diagram-2" src="/files/diagram-2.png" alt="diagram-2">',
    );
    expect(renderWiki(placeholder)).toBe('<div class="panel panel-info"><div class="panel-body"><p>MERMAID → diagram-2.mmd</p></div></div>');
  });
});

describe('merged table cells (⇐ / ⇑ markers)', () => {
  const table = (body: string) => `<table class="wiki-table"><tbody>${body}</tbody></table>`;

  it('renders colspan and rowspan', () => {
    expect(renderWiki('||Name||⇐||\n|a|b|')).toBe(table('<tr><th colspan="2">Name</th></tr><tr><td>a</td><td>b</td></tr>'));
    expect(renderWiki('|a|b|\n|⇑|c|\n|⇑|d|')).toBe(table('<tr><td rowspan="3">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td></tr>'));
  });

  it('renders a 2x2 merge', () => {
    expect(renderWiki('|a|⇐|x|\n|⇑|⇐|y|')).toBe(table('<tr><td colspan="2" rowspan="2">a</td><td>x</td></tr><tr><td>y</td></tr>'));
  });

  it('keeps markers as text when they do not form rectangles', () => {
    expect(renderWiki('|⇐|a|')).toBe(table('<tr><td>⇐</td><td>a</td></tr>'));
    expect(renderWiki('|a|b|\n|⇐|⇑|')).toBe(table('<tr><td>a</td><td>b</td></tr><tr><td>⇐</td><td>⇑</td></tr>'));
  });

  it('counts merges per table for the export warning, outside code blocks', () => {
    const markup = '|a|b|\n\n||H||⇐||\n|x|⇐|\n\n{code}\n|q|⇐|\n{code}\n|c|⇐|';
    expect(tableMerges(markup)).toEqual([
      { table: 2, merges: 2, markup: '||H||⇐||\n|x|⇐|' },
      { table: 3, merges: 1, markup: '|c|⇐|' },
    ]);
  });
});
