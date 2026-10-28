# Testdoc Studio

Write manual test cases and Confluence pages on your own machine, then import plain files into Jira/Xray and
Confluence.

> Testdoc Studio is an independent tool. It is not affiliated with Atlassian or the makers of Xray; it only reads and
> writes their file formats.

## Quick start

Requirements: [Node.js](https://nodejs.org) 22.12 or newer (24 recommended). The project folder path must not
contain `:`.

```sh
npm install
npm start
```

Open <http://127.0.0.1:4400>. Stop the app with `Ctrl+C` in the terminal; restart it after pulling changes to `server/`.

## What it does

**Tests (Jira + Xray manual steps)**

- A list of tests with search, rename, duplicate and delete.
- A step grid like Xray's: Action, Data and Expected Result in Jira wiki markup with a live preview, reordering by
  drag and drop, insert above/below, multi-select delete, copy a cell's markup.
- Import an Xray steps CSV by dropping it on the screen; **Export CSV** writes a file for Xray's *Import steps*. The CSV
  round-trips byte for byte.

**Docs (Confluence pages)**

- A visual editor that looks like a Confluence page: headings, lists, tables with merged cells, code, info/note/warning
  panels, pasted images. A **Markup** mode shows the wiki markup next to a live preview.
- Diagrams drawn on a canvas (shapes, arrows, labels) and saved as Mermaid, which Confluence's draw.io imports.
- One current doc plus an archive; autosave; export and re-import of a doc folder.

## Getting the files into Jira and Confluence

Exports land in `exports/<name>/`.

- **Test**: in Xray, open the test and use *Import steps* with the exported `.csv`. Xray asks whether to replace or
  merge existing steps.
- **Doc**: in the Confluence editor, use *Insert → Markup → Confluence wiki* and paste `page.txt`. Then:
  - upload the `image-N.png` files as page attachments;
  - replace each `MERMAID → diagram-N.mmd` panel with a draw.io macro, and in draw.io use
    *Arrange → Insert → Advanced → Mermaid* with the `.mmd` file;
  - if the export warns about merged table cells, open `page.html` in a browser, click **Copy table N** and paste it
    over the table with ⇐/⇑ arrows.

The full workflow is in [`docs/spec.md`](docs/spec.md).

## Your data stays local

- The app listens on `127.0.0.1` only and sends nothing anywhere. The page's Content Security Policy blocks loading
  anything from outside the app, including external images referenced in markup.
- Tests and docs are plain files in `data/`, exports in `exports/`. Both folders are git-ignored.
- Real files from work (for example a real Xray export used by a test) go in `private/`, which is git-ignored too.
  Never commit company data; the repository's examples are made up.

## Development

| Command | What it does |
|---|---|
| `npm start` | Runs the app: Express serves `/api`, Vite serves the UI in the same process |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |

- `server/`: Express API, file storage, exports.
- `src/`: React UI (`src/tests/`, `src/docs/`).
- `shared/`: format code used by both sides: Xray CSV, wiki markup rendering, the visual editor's wiki conversion,
  Mermaid generation.
- `docs/spec.md`: the agreed behavior. `docs/progress.md`: what is done and what comes next.

## License

No license has been chosen yet.
