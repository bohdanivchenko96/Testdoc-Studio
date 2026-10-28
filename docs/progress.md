# Progress

Project memory: where implementation stands and what comes next. Read at the start of a session, update at the end.

## Done

- **Scaffold**: Express + Vite middleware in one process, React shell with Tests/Docs nav. `npm start` verified after the folder rename (no `:` in path).
- **Xray CSV** (`shared/xrayCsv.ts`): golden round-trip test passes.
- **Tests section** (2026-10-28):
  - `shared/wikiMarkup.ts` (was `jiraWiki.ts`): wiki markup → HTML preview, unit-tested.
  - `server/testStore.ts`: one JSON per test in `data/tests/`, atomic writes, uuid ids.
  - `server/testsRouter.ts`: `/api/tests` list/get/create/update/delete, `/:id/duplicate`, `/import` (`{name, csv}`), `/:id/export` → `exports/<name>/<name>.csv` and opens the folder in Finder. Export refuses a test with no steps or an empty Action.
  - `src/tests/`: list (search, create, rename, duplicate, delete), Grid step editor (preview cells, click to edit, toolbar, DnD and ↑/↓ reorder), autosave 0.6 s after the last change, CSV drop import.
  - Driven end to end in headless Chrome. Import → storage → export of the real Xray export (now `private/csv_example.csv`) is byte-identical.

- **Docs design** agreed (2026-10-28, second grilling), written into `docs/spec.md` > Docs. draw.io embedding was dropped in favor of an in-app canvas that exports Mermaid.
- **Docs section** (2026-10-28), all 8 plan steps:
  - `shared/wikiMarkup.ts`: `renderWiki(markup, { imageUrl? })` with headings, tables, panels, images, diagram placeholder; `referencedFiles()` for export/import.
  - `server/docStore.ts` (+ tests): doc folders, `state.json`, current/archive, N counters. Counters also skip numbers the markup references (a file missing after import may exist in Confluence); spec updated.
  - `server/docsRouter.ts`: current, archive, new, open, delete, image upload, diagram save, file serving, export, import.
  - `src/docs/`: top bar, split editor + preview, toolbar (`src/markupEdit.ts`), image paste/pick with PNG conversion, archive panel, folder/loose-file drop import.
  - `shared/diagram.ts` (+ tests): canvas model → Mermaid `flowchart` with entity escaping. `src/docs/DiagramCanvas.tsx`: 6 shapes, solid/dotted labelled edges, TD/LR, Save → `.json`/`.mmd`/`.png`, reopen from preview.
  - End to end in headless Chrome (22 checks): markup preview, PNG + JPEG paste, diagram draw/save/reopen, export file set, new doc, loose-file import with a missing file, archive open/delete. Fixed on the way: diagram PNG had black SVG fills (`html-to-image` drops stylesheet fills; paint moved to SVG attributes).
  - Not automated: dropping a real folder (`webkitGetAsEntry` can't be faked in a synthetic drop). Check by hand once.

- **User feedback round 1** (2026-10-28), checked in headless Chrome (14 checks):
  - Docs toolbar: H1.
  - Panels in the preview: Confluence DC colors (info blue, note yellow, warning red) and icons, CSS-only (`.panel::before`).
  - Canvas: shapes resize with `NodeResizer`; `width`/`height` saved in `diagram-N.json`.
  - Tests: step checkboxes, Shift+click range, select all, Delete selected.
  - Enter continues `#`/`*`/`-` lists in step cells and the Docs editor (`continueList` in `src/markupEdit.ts`, unit-tested).
  - Canvas labels edited in place instead of `window.prompt` (10 checks): `LabelInput` in shapes and in a custom `labeled` edge (HTML label via `EdgeLabelRenderer`, still in the PNG). New shapes open in edit mode. React Flow hides a node until measured, so focus is retried per frame.
  - Elbow edges (`getSmoothStepPath`): default for new edges, "Elbow / curve" toggles selected ones, `elbow` in `diagram-N.json` (8 checks).
  - Canvas selection like draw.io (11 checks): `selectionOnDrag`, `panOnDrag={[1, 2]}`, `panOnScroll`, Shift/Cmd/Ctrl multi-select, Cmd/Ctrl+A via a window keydown listener. E2E note: wait for the label to have focus before pressing Enter, or Enter hits the still-focused toolbar button.
- **Docs visual editor** (2026-10-28, third grilling: approach A, verbatim rule relaxed for Docs only, Visual | Markup switch, TipTap 3.31.4 pinned):
  - `shared/wikiDoc.ts` (+ 37 tests): wiki ⇄ TipTap JSON. Corpus tests check that `renderWiki` of the regenerated markup equals the original's and that a second pass changes nothing.
  - `src/docs/visual/`: `extensions.tsx` (panel, diagram, wikiImage, rawWiki nodes; codeBlock params; wiki input rules `h2. `/`# `; markdown mark rules off), `VisualToolbar.tsx` (active states, table tools, undo/redo), `VisualEditor.tsx`.
  - `DocEditor.tsx`: mode switch (localStorage `docs.editorMode`), name as page title in Visual, uploads and diagram saves insert into whichever editor is mounted.
  - Fixed on the way: Save then quick Close on the canvas reopened it; clicking an edge label now selects the edge.
  - Checked in headless Chrome: 22 visual checks, and the original Docs run (22 checks) in the Markup mode. Test note: ProseMirror reads the selection on the async `selectionchange`, so a test must pause briefly between moving the selection and a shortcut.
- **Merged table cells** (2026-10-28, option 1 of three): `⇐`/`⇑` marker cells in the markup. `resolveMerges`, `splitTableRow`, `tableMerges` in `shared/wikiMarkup.ts` serve the preview, `wikiDoc.ts` and the export warning. Visual toolbar: Merge/Split; table tools always shown, disabled outside a table. 10 unit tests, 11 browser checks.
- **page.html for merged tables** (2026-10-28; `{html}` macro is off in the user's Confluence): `server/tablesPage.ts` (+ test). Export writes it when a table has merges; each table has a Copy button (select + `execCommand('copy')`, works from `file://`). Checked: the clipboard carries `<th colspan="2">`. Verified by the user in the real Confluence: it keeps the merge on paste.
- **Steps: insert above/below, copy cell** (2026-10-28): a hovered row shows a + on its top and bottom edges (`.row-insert`, left end of the grid); row actions stay one row of ↑ ↓ ⧉ ✕. `CopyButton` in `StepCell.tsx` copies the raw markup via `navigator.clipboard`. 9 browser checks. Tried and dropped: a 3×2 icon grid (unclear) and a ⋯ menu (the user wants one click per action).
- **Security pass** (2026-10-29): no telemetry in the 197 packages; the only install script is esbuild's binary check; a full UI run made 62 requests, all to 127.0.0.1, and the server opened no outbound connections. Fixed: Vite HMR rides on the app's server (`hmr: { server }`) instead of its own port on every interface; CSP header blocks anything not from the app (an external `!https://…!` image is refused); `data/` is in `.gitignore`. All browser suites pass under the CSP with zero violations.
- **Company data out of git, rename** (2026-10-29): the real Xray export moved to `private/` (git-ignored); tests use the made-up `shared/xrayCsv.fixture.ts` and run the real file only when present. `BANNER_TEXT_TOP` (from the real file) replaced with `MAX_RETRY_COUNT`. A scan of every file git would push found no tokens from the real CSV. Project renamed to Testdoc Studio (package `testdoc-studio`); the folder rename is the user's.
- **README.md** (2026-10-29): quick start (Node ≥ 22.12, which vitest needs), features, getting files into Jira/Confluence, data privacy, dev commands. License: none chosen yet.
  - Possible next: alignment guides while dragging (React Flow has no built-in; offsets of a few px give a small jog in elbow lines), draggable bend points.

## Next

- Hand-check folder drop import (drag `exports/<name>/` onto Docs).
- Checks in the real systems are all done (spec > To verify in the real systems): Xray Import steps offers replace or merge; Confluence paste of markup, Mermaid and page.html tables works.
- Version 2 candidates from the spec: `{toc}`, `{expand}`, image `|width=`, Jira issue key links, sequence diagrams.

## Notes

- UI checks: no `chromium-cli` here. `playwright-core` installed in a scratch dir with `channel: 'chrome'` (system Chrome) works.
- `tsx` runs without watch: restart `npm start` after server changes.
- Isolated run for E2E: `PORT=4401 MOCK_DATA_DIR=… MOCK_EXPORTS_DIR=… MOCK_NO_REVEAL=1 npx tsx server/index.ts` (no Finder windows, user data untouched). HMR shares the app's port, so instances don't clash.
- The page has a strict CSP. Playwright's `waitForFunction` evaluates a string and is blocked by it: poll with `page.evaluate` instead, or the run fails with "unsafe-eval".
