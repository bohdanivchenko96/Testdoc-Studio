# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Testdoc Studio**: a local-only authoring tool, not affiliated with Atlassian or Xray. It mocks Jira+Xray (manual test steps) and Confluence (one doc at a time). It exports files that the user carries by hand into a slow VDI and imports into the real Jira 10.3 / Confluence 9.2 Data Center. Full agreed spec: `docs/spec.md`. Read it before changing behavior.

## Commands

- `npm start`: one process on `http://127.0.0.1:4400`. Express serves `/api`, and Vite runs in middleware mode for the UI.
- `npm test`: Vitest.
- `npm run typecheck`: `tsc --noEmit`.

Keep `:` out of the project path. Vite refuses to serve any path that contains `:` (it answers 403), and the colon also breaks `node_modules/.bin` on `PATH`.

## Layout

- `server/`: Express API and the Vite middleware.
- `src/`: React UI.
- `shared/`: pure format code used by both sides.
  - `xrayCsv.ts` implements the Xray steps CSV.
- `data/`: user state as plain files. `exports/`: export output. `private/`: real exports from work used by tests. All three gitignored.

## Invariants

- Xray CSV export must round-trip byte for byte. Golden tests in `shared/xrayCsv.test.ts`: the made-up `shared/xrayCsv.fixture.ts` always, and the real export `private/csv_example.csv` when present. Quoting follows Commons CSV `MINIMAL`.
- Company data never goes into git. `private/`, `data/` and `exports/` are git-ignored. Never copy text from them (test content, keys, names) into tracked files, tests or docs; write made-up examples instead.
- Step and doc markup is stored verbatim. Never normalize wiki markup, nbsp or line endings. One agreed exception: an edit in the Docs visual editor regenerates the doc's markup from the editor document (`shared/wikiDoc.ts`). Opening a doc without editing changes nothing, unknown block macros stay verbatim, and the Markup mode edits text as is.

## Working agreement

- Project memory lives in this repo, not in `~/.claude`: progress and next steps in `docs/progress.md`, working rules here. Read `docs/progress.md` at session start and update it when work lands.
- Never commit. The user manages git.
- Change project files with the Edit/Write tools, not shell scripts (`python3`, `sed`, `cat <<EOF`). Edits inside the project are pre-approved in `.claude/settings.local.json`; shell commands are not, apart from `npm test`, `npm run typecheck` and `npx vitest`.
- Reply to the user in Ukrainian. In grilling rounds, "+" means "accept the recommendation", so keep recommendations concrete.
- The user is a QA engineer who writes manual Xray tests and Confluence docs and reaches the real systems only through a slow VDI. VDI transfer and company policy are out of scope.

## Skills

Skills from `mattpocock/skills` (GitHub) are managed with the `skills` CLI and pinned in `skills-lock.json`. Claude Code loads them from `.claude/skills/`; `.agents/skills/` holds older copies for other agents.

- Add or update: `npx skills@latest add mattpocock/skills -a claude-code -s <name> -y` / `npx skills@latest update`
- `code-review`: two-axis review (Standards vs. Spec) of `git diff <fixed-point>...HEAD`, run as two parallel sub-agents whose reports are kept separate, not merged or reranked.
- `grill-me` → `grilling`; `grill-with-docs` → `grilling` + `domain-modeling` (writes `GLOSSARY.md` and `docs/adr/` lazily).
- `setup-matt-pocock-skills`: one-time, user-invoked repo setup (issue tracker, domain docs layout). It writes `docs/agents/*.md` and an `## Agent skills` section in this file.
