import { describe, expect, it } from 'vitest';
import { tableMerges } from '../shared/wikiMarkup';
import { tablesPage } from './tablesPage';

describe('tablesPage', () => {
  it('renders each merged table with its number, spans and a copy button', () => {
    const html = tablesPage('Spec <v2>', tableMerges('|a|b|\n\n||Name||⇐||\n|*x*|y|'));
    expect(html).toContain('<title>Spec &lt;v2&gt;: tables with merged cells</title>');
    expect(html).toContain('<h2>Table 2</h2>');
    expect(html).toContain('onclick="copyTable(2)"');
    expect(html).toContain(
      '<div id="table-2"><table class="wiki-table"><tbody><tr><th colspan="2">Name</th></tr><tr><td><strong>x</strong></td><td>y</td></tr></tbody></table></div>',
    );
    expect(html).not.toContain('Table 1<');
  });
});
