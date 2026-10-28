import { escapeHtml, renderWiki, type MergedTable } from '../shared/wikiMarkup';

// page.html in a doc export: the tables with merged cells, rendered as real HTML tables. Wiki markup can't merge
// cells and the {html} macro is off in the user's Confluence, so the user copies each table from this page in a
// browser and pastes it into the Confluence editor, which keeps colspan/rowspan (docs/spec.md > Docs > Export).
export function tablesPage(docName: string, tables: MergedTable[]): string {
  const sections = tables.map(
    ({ table, markup }) => `<section>
  <h2>Table ${table}</h2>
  <button type="button" onclick="copyTable(${table})">Copy table ${table}</button> <span id="status-${table}" class="status"></span>
  <div id="table-${table}">${renderWiki(markup)}</div>
</section>`,
  );
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(docName)}: tables with merged cells</title>
<style>
  body { max-width: 960px; margin: 24px auto; padding: 0 16px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #172b4d; }
  .how { color: #44546f; }
  table { border-collapse: collapse; margin: 8px 0 24px; }
  th, td { min-width: 40px; height: 28px; padding: 4px 8px; border: 1px solid #8590a2; text-align: left; vertical-align: top; }
  th { background: #f1f2f4; }
  button { padding: 4px 10px; cursor: pointer; }
  .status { color: #216e4e; }
</style>
</head>
<body>
<h1>${escapeHtml(docName)}</h1>
<p class="how">Wiki markup can't merge table cells, so these tables come as HTML. For each one: click <b>Copy table N</b>
(or select the table with the mouse and press Ctrl+C), then in Confluence delete the table with ⇐/⇑ arrows and paste
this one in its place.</p>
${sections.join('\n')}
<script>
  // Selecting the table and copying keeps the HTML, so Confluence receives the merged cells.
  function copyTable(n) {
    var range = document.createRange();
    range.selectNode(document.getElementById('table-' + n));
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    var ok = document.execCommand('copy');
    selection.removeAllRanges();
    document.getElementById('status-' + n).textContent = ok ? 'Copied' : 'Copy failed: select the table and press Ctrl+C';
  }
</script>
</body>
</html>
`;
}
