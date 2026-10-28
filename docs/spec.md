# Spec: Testdoc Studio (local Jira/Xray + Confluence authoring)

Testdoc Studio is not affiliated with Atlassian or the makers of Xray; it only reads and writes their file formats.

Agreed in a grilling session on 2026-10-28.

## Purpose

The real Jira and Confluence are reachable only through a slow VDI. This app lets the user write, locally:

- the **steps of manual Xray tests**
- **one Confluence doc at a time**

The app exports files that the user carries into the VDI by hand and imports into the real systems:

- Jira 10.3.x Data Center with Xray for Data Center (Xray version unknown)
- Confluence 9.2.x Data Center

The mock is the source of truth. Edits made directly in the real systems are not pulled back. Moving files into or out of the VDI, and whether company policy allows it, is out of scope.

## Runtime

- Runs on the local machine only: no hosting, no git remote.
- TypeScript throughout. React + Vite for the UI, a small Node (Express) server that reads and writes files.
- `npm start` starts one process on `127.0.0.1`. No auth, single user.
- UI language is English. The look is Atlassian-like, built with our own CSS (no Atlaskit). A left nav switches between **Tests** and **Docs**.

## Storage

- All state is plain files under `data/`:
  - a test is one JSON file;
  - a doc is a folder with a `.wiki` file, metadata, and its images and diagram files (see **Docs > Storage**).
- There is no backup feature. The user backs up by copying `data/` or committing it to a local git repo.
- Exports are written to `exports/<name>/`, and the app opens that folder in Finder. There is no browser download.

## Tests (Xray)

### Model

A **test case** is a local name plus an ordered list of **steps**. Each step has:

- `Action`: required.
- `Data`: may be empty. Jira shows an empty field as "None".
- `Expected Result`: may be empty.

There are no other fields: no issue key, summary, labels, preconditions, test sets, folders or step attachments. One test case maps to one CSV file. The user creates the Test issue in Jira by hand, then runs **Import steps** on it with the CSV.

### Text format

Step text is Jira wiki markup and is stored **verbatim**. The app never normalizes it:

- `{*}x{*}` stays as written;
- `\xa0` is kept;
- the mix of CRLF and LF inside fields is kept.

Browser textareas turn any edited text into LF. Jira accepts both line endings, so this is acceptable.

The preview renders this subset:

- `#` and `*` lists, including nested ones like `#*` and `#**`
- `*bold*` and `{*}bold{*}`
- `_italic_`
- `{{mono}}`
- `{code[:lang]}…{code}`
- links

Toolbar buttons insert: numbered list, nested bullet, bold, code.

### UI

- **List:** flat, sorted by last modified, with search by name. Actions: create, rename, duplicate, delete (with confirmation).
- **Step editor:** modeled on the Xray Grid view.
  - Each row has a step number and three columns.
  - Steps can be added (at the end, or as an empty step above or below any step), deleted and duplicated. Every action is one click: a hovered row shows a + on its top and bottom edges (left end) to insert there; the row's ↑ ↓ ⧉ ✕ buttons move, duplicate and delete.
  - Each non-empty cell has a copy button (on hover) that copies its markup as stored.
  - Steps are reordered with drag-and-drop or ↑/↓ buttons.
  - Steps can be selected with checkboxes (Shift+click selects a range, the header box selects all) and deleted together, after confirmation.
  - Cells show the markup preview; clicking a cell edits it.
  - In a list item (`# `, `* `, `#* `, `- `), Enter starts the next item with the same marker. Enter on an empty item ends the list, or moves a nested item one level up. Shift+Enter is a plain line break. The Docs editor does the same.

### CSV format

The CSV export must match a real Xray export **byte for byte** when a test is imported and exported unchanged. Real exports hold company data, so they live only in the git-ignored `private/` folder (`private/csv_example.csv`); the repository carries a made-up example written to the same conventions (`shared/xrayCsv.fixture.ts`). The format:

- UTF-8 without BOM, delimiter `,`, records end with CRLF (including the last one).
- The header is exactly `Action,Data,Expected Result`.
- Quoting is the Apache Commons CSV `MINIMAL` mode, which the Xray exporter appears to use. A field is wrapped in `"…"`, with `"` doubled to `""`, when any of these holds:
  - its first character is `<= '#'`, which covers space, `!`, `"` and `#`;
  - it contains `,`, `"`, CR or LF;
  - its last character is `<= ' '`;
  - it is empty and is the first field of the record.

  Otherwise the field is written unquoted.

**Import** happens by dragging a CSV onto the app. It reads the same format and accepts both CRLF and LF record separators.

## Docs (Confluence)

Decisions below were agreed in a second grilling session on 2026-10-28.

### Storage

- Each doc is a folder `data/docs/<uuid>/` holding:
  - `page.wiki`: the markup, stored verbatim;
  - `meta.json`: `{ name, createdAt, updatedAt }`;
  - its files: `image-N.png`, `diagram-N.json`, `diagram-N.mmd`, `diagram-N.png`.
- `data/docs/state.json` holds `{ currentId }`. It is the only place that says which doc is current.
- `name` is required. It names the export folder.
- **Numbering:** a new image or diagram gets N = highest existing N + 1, counting both the files in the doc folder and the files the markup references (a referenced file can be missing after an import, yet exist as an attachment in Confluence). Images and diagrams have separate counters. Numbers are never reused: in Confluence, uploading a file with an existing name adds a new version of that attachment, so a reused number would silently swap the picture on an old page.
- Files that the markup no longer references stay in the doc folder, so an undo or a restored line still finds them.

### Workflow

- There is always exactly one **current** doc. Every other doc is in the **archive**.
- **New doc** moves the current doc to the archive and creates an empty current doc.
- **Open** on an archived doc swaps it with the current doc.
- Only the current doc is edited.
- A doc can be deleted only from the archive, after confirmation.

### Screen

- The top bar has:
  - a **Visual | Markup** mode switch (agreed on 2026-10-28, third grilling). Visual is the default; the browser remembers the last mode;
  - the save status;
  - **New doc**, **Export** and **Archive**.
- **Archive** opens a panel listing archived docs, sorted by last modified, with search by name. Actions: Open, Delete.
- **Visual mode** looks like a Confluence page: a centered column about 860 px wide, the doc name as the page title on top, and a WYSIWYG editor (TipTap) below it. The toolbar buttons format the selection, as in Confluence.
  - Panels show a title field, a type switch and a remove button on hover. A diagram shows its PNG; double-click or **Edit diagram** opens the canvas. Images are shown inline.
  - A block macro the editor doesn't know (`{toc}`, `{expand}`…) shows as a gray "raw wiki" block with its text editable as is.
  - Typing shortcuts follow wiki habits: `h2. ` makes a heading, `# ` or `1. ` a numbered list, `* ` or `- ` a bullet list. Markdown mark shortcuts are off.
  - Tables: the toolbar adds or removes rows and columns, merges selected cells, splits a merged cell, toggles the header row and deletes the table while the caret is in a table.
- **Merged cells** (agreed 2026-10-28). Wiki markup has no colspan or rowspan, so the mock writes markers into the cells a merge covers: `⇐` means "merged into the cell on the left", `⇑` "merged into the cell above". The top row of a merge uses `⇐`, the first column below it `⇑`, the rest `⇐`. Example: `||Name||⇐||` is one header across two columns.
  - The visual editor, the Markup preview and Tests step previews show markers as real merges. Markers that don't form rectangles stay plain text. A cell whose whole text is `⇐` or `⇑` is always read as a marker.
  - Confluence shows the arrows as text (Insert > Markup can't merge cells, and the `{html}` macro is off in the user's Confluence). Export writes `page.html` with each merged table as a real HTML table and a **Copy table N** button; the user deletes the arrow table in Confluence and pastes the copy in its place. Merging the arrow cells by hand stays the fallback. Export adds a warning per table with merges.
- **Markup mode** has the markup textarea on the left and the live preview on the right, as before. There is no scroll sync. The doc name is in the top bar.
- **Markup in the visual mode.** The doc is still stored as wiki markup. Opening a doc changes nothing. An edit in the visual mode regenerates the whole markup from the editor document (`shared/wikiDoc.ts`):
  - blocks are separated by a blank line, panels and code are written on their own lines;
  - `{*}`/`{_}` replace `*`/`_` next to word characters, so mid-word formatting survives in Confluence;
  - unknown block macros are written back verbatim;
  - `[url]` becomes a bare URL; a line break inside a list item, heading or table cell becomes a space.
  The preview of the regenerated markup matches the original (tested on a corpus in `shared/wikiDoc.test.ts`). Tests steps and the CSV keep the verbatim rule.
- Edits are saved automatically 0.6 s after the last change, as in Tests.

### Editor

The editor takes Confluence wiki markup. Version 1 supports:

- headings `h1.`–`h6.`
- bold, italic and `{{mono}}`
- lists
- tables (`||header||`, `|cell|`)
- `{code}`
- `{info}`, `{note}` and `{warning}` panels
- plain links
- images, referenced as `!image-N.png!`

**Toolbar:** h1, h2, h3, bold, italic, mono, bullet, numbered, table, code, info, note, warning, image, diagram.

**Images:**

- Pasting an image into the textarea (Cmd+V) saves it as `image-N.png` and inserts `!image-N.png!` at the caret.
- The toolbar image button does the same with a picked file.
- An image that is not PNG is converted to PNG in the browser.

Version 1 leaves out:

- links to Jira issue keys;
- `{toc}`, `{expand}` and image `|width=`, deferred to version 2.

### Preview renderer

One renderer, `shared/wikiMarkup.ts`, serves both Tests and Docs. It is the former `shared/jiraWiki.ts`, extended with headings, tables, panels and images.

- It is called as `renderWiki(markup, { imageUrl? })`.
- Docs passes `imageUrl`, which maps a file name to its URL in the doc folder.
- Tests passes no `imageUrl`. Steps have no attachments, so `!x.png!` stays plain text there.
- Tests step previews also render the new blocks. Jira supports them in text fields too.

### Diagrams

Diagrams are drawn on a visual canvas inside the app and exported as Mermaid. The user pastes the Mermaid into Confluence's draw.io, which turns it into an editable diagram. draw.io itself is not embedded in the app.

**Canvas** (`@xyflow/react`, full screen). Version 1 draws Mermaid `flowchart` only. Sequence and other diagram types, and a text mode for them, are deferred to version 2. The canvas offers:

- **Shapes**, each mapping to Mermaid:

  | Shape | Mermaid |
  |---|---|
  | rectangle | `A[text]` |
  | rounded | `A(text)` |
  | diamond | `A{text}` |
  | stadium | `A([text])` |
  | circle | `A((text))` |
  | cylinder | `A[(text)]` |

- **Edges:** solid `-->` or dotted `-.->`, with an optional label. On the canvas an edge is drawn with right-angle bends (the default for new edges) or as a curve, toggled per selected edge. Diagrams saved before this stay curved. The line shape is kept in `diagram-N.json` only; Mermaid has none.
- **Direction:** `TD` or `LR`.
- **Editing:** text is typed in place, with no browser dialogs. A new shape opens with its default text selected. Double-click edits a shape's text or an arrow's label. Enter or a click elsewhere keeps the text, Shift+Enter adds a line, Escape cancels. Delete removes the selection.
- **Selection and moving**, as in draw.io: a drag on empty space draws a selection box; Shift/Cmd/Ctrl+click adds to the selection; Cmd/Ctrl+A selects everything; dragging a selected shape moves all selected shapes. The canvas pans with scroll or a right/middle-button drag and zooms with a pinch or Ctrl+scroll. A selected shape can be resized by its corners and sides (a circle keeps its proportions). The size is kept in `diagram-N.json` only; Mermaid has no sizes.
- **Not in version 1:** subgraphs, colors and styles.

**Save** writes three files:

- `diagram-N.json`: the canvas model with positions, used only by the mock;
- `diagram-N.mmd`: the generated Mermaid;
- `diagram-N.png`: a snapshot of the canvas made with `html-to-image`.

**In the markup** the diagram is a placeholder: `{info}MERMAID → diagram-N.mmd{info}`.

**In the preview** the placeholder shows `diagram-N.png`. Clicking it reopens the canvas.

**Mermaid keeps no positions.** In Confluence, draw.io lays the diagram out automatically. The user fixes the layout there if needed.

**In Confluence:**

1. Replace the placeholder with a draw.io macro.
2. Choose Arrange > Insert > Advanced > Mermaid and paste the contents of the `.mmd` file.
3. As a fallback, insert `diagram-N.png` as a plain image.

### Export

- The export clears `exports/<name>/` and then writes:
  - `page.txt` with the wiki markup;
  - every file the markup references: `image-N.png`, and for each diagram `diagram-N.mmd`, `diagram-N.png` and `diagram-N.json`;
  - `page.html`, only when a table has merged cells (see **Merged cells**). Import ignores it: `page.txt` keeps the markers.
- `.json` is not needed in Confluence. It lets the canvas come back when the folder is imported into the mock again.
- Files the markup does not reference are left out.
- A referenced file that is missing produces a warning, not an error.
- The app opens the folder in Finder.

To bring it into Confluence:

1. Paste the markup with Insert > Markup > Confluence wiki.
2. Upload the images as attachments.
3. Replace each diagram placeholder as described in **Diagrams**.
4. To update a page that already exists, select all of its content and paste over it. Insert > Markup does not replace a page.

### Import

- The user drags an export folder onto the Docs screen, or `page.txt` together with its files.
- File references are matched to the dropped files and copied into the new doc folder. A missing file produces a warning, not an error.
- The imported doc becomes the current doc. The previous current doc goes to the archive.
- The name comes from the dropped folder's name, or is `Imported doc` when only files were dropped.
- The N counters continue from the highest numbers among the imported files and the markup's references (see **Numbering**).

## Testing

- Vitest.
- Golden tests: the made-up example in `shared/xrayCsv.fixture.ts` reads into known steps and writes back byte-identical; when `private/csv_example.csv` exists (the author's machine), the real export must round-trip byte-identical too.
- Unit tests for the markup → preview renderer and for the canvas → Mermaid generator.

## To verify in the VDI

Nothing open.

Verified: on a test that already has steps, Xray DC's Import steps lets the user choose to replace the existing steps or merge with them (2026-10-28).

Verified: Confluence 9.2's draw.io has Arrange > Insert > Advanced > Mermaid (confirmed by the user on 2026-10-28).

Verified: the `{html}` macro does not work in the user's Confluence (2026-10-28).

Verified: a table copied from `page.html` and pasted into the Confluence editor keeps its merged cells (2026-10-28).
