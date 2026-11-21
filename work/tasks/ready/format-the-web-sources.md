---
title: 'Format the web sources with Prettier, and keep them formatted'
slug: format-the-web-sources
blockedBy: []
covers: []
---

## What to build

`web/` has a Prettier setup (`web/.prettierrc`, `web/.prettierignore`, `pnpm format` and `pnpm format:check` in `web/package.json`), but nothing runs the check: the root `verify` is `web:check`, `web:test`, `web:build`, `web:budgets` and `web:e2e`. On origin/main on 2026-11-21 (after `runner-resolves-rocketh-router`), `prettier --list-different .` in `web/` lists 72 files, 48 of them under `src/lib/playground/` and `test/lib/playground/`.

Run `pnpm format` in `web/`, commit the result as a formatting-only change, and add the check to the root `verify` (for example a `web:format:check` script run first, as rocketh's verify does), so it stays formatted.

Mind the copies: README.md's "Copied from jolly-roger" bullet says which files are unchanged below their header. Of those, only `src/routes/contracts/components/ContractFunction.svelte` is in the list today, and it already lists its changes in its header. Either add "formatted" to that header's list, or add the copied files to `web/.prettierignore` so a copy stays comparable with its source; say which in the report.

## Acceptance criteria

- [ ] `pnpm format:check` passes in `web/`, and the change formats only (no other edit in the diff).
- [ ] The root `verify` runs the format check.
- [ ] The copied files' headers (or `.prettierignore`) still say truthfully what differs from jolly-roger.
- [ ] `pnpm verify` is green.

## Blocked by

- None. Can start immediately.

## Prompt

> Goal: format `web/` with its own Prettier setup and add the check to `verify`. Read `AGENTS.md` and `web/src/lib/playground/README.md` ("Copied from jolly-roger"). Done means `pnpm verify` is green and runs the format check.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If it does not, stop and report the discrepancy.
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. Do not write the done record, the commit message or the PR body yourself.
