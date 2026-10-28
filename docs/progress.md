# Progress

Where the project stands and what comes next. Behavior is in `docs/spec.md`, history in git. Keep this file short.

## Current state

Everything in `docs/spec.md` is built: Tests (Xray steps grid, CSV import/export), Docs (visual and markup editors,
diagrams, merged tables, export/import, archive), security hardening and Windows readiness. Unit tests and the
browser checks pass; the real systems accept the exports (spec > To verify in the real systems).

## Next

- Run once on a real Windows machine: `npm install`, `npm test`, `npm start`, export one test and one doc.
- Check folder drop import by hand: drag `exports/<name>/` onto Docs.
- Canvas: alignment guides while dragging (offsets of a few px leave a small jog in elbow lines), draggable bend
  points.
- Version 2 candidates from the spec: `{toc}`, `{expand}`, image `|width=`, Jira issue key links, sequence diagrams.
- Open choices for the user: a license, and the license of the bundled `mattpocock/skills` before a public push.
