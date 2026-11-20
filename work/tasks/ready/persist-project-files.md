---
title: 'Edited project files survive a reload'
slug: persist-project-files
spec: rocketh-playground
blockedBy: []
covers: [11]
needsAnswers: true
---

## What to build

Today a reload restores the chain and the deployment records (each in IndexedDB), but the reader's edits to the project files are lost: the session starts from the starting project every time. Make the project files (and which file is selected) persist in IndexedDB beside the chain and the records, so a reload brings back exactly what the reader was editing. The first visit, with nothing saved, still opens the starting project. The spec's Persistence decision names the store: `createPersistentVFS` with `createIndexedDBPersistence` from `@rocketh/web` (already a dependency); use it unless reading it shows it does not fit, and say why if so. The session takes the database name as an option, as it does for the chain and the records, and the browser composition (`web/src/lib/index.ts`) passes one.

## Acceptance criteria

- [ ] An edit to a deploy script and to a contract is still there after a reload, and the file that was selected is selected again (e2e).
- [ ] A new session on the same files database starts from the saved files, not the starting project; one on an empty database starts from the starting project (node test, with `fake-indexeddb` as the existing IndexedDB tests use it).
- [ ] The chain and the records are restored as before, and a Deploy after the reload with no edit sends nothing (the existing reload e2e still passes).
- [ ] The language service and the background compile see the restored files (the editor shows no stale diagnostics after a reload).
- [ ] The page's first load grows by no more than the files store itself: `@rocketh/web` is loaded only by the runner today (a lazy chunk), and importing the store must not pull rocketh into the page. Measure the first load before and after (raw and gzip) and report both.
- [ ] Tests cover the new behaviour (mirror the existing session and e2e tests).

## Blocked by

- None: can start immediately.

## Prompt

> Goal: the reader's project files persist across a reload. Look at how `session.ts` takes `chainDB` and `deploymentsDB` and how `web/src/lib/index.ts` composes them; the files store follows the same shape. The seams to test at are the session (node, `test/lib/playground/session.test.ts`) and the page (`e2e/tests/playground.e2e.ts`).
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Applied answers 2026-11-20

### q1: 'task:persist-project-files' was bounced — how should we proceed?

Retry, continuing from the kept branch. The gate failed in the fresh worktree on a pre-existing race, not on this task's code: in a clean tree `web/static/solc/` has no soljson, so several vitest workers call `ensureSoljson` (`web/scripts/soljson.mjs`) at once, each fetches and rewrites the file with `writeFileSync`, and one worker's `loadSoljson` reads it while another is rewriting it (the SyntaxError in `test/lib/playground/helpers.ts`, seen from `workers.test.ts`). Keep the persist work as it is and also fix the race: make `ensureSoljson` write atomically (write to a unique temporary file in `static/solc/`, then `renameSync` it over the final path), with a comment saying why. Record it in the Decisions block. Check that `pnpm verify` passes from a tree with no `web/static/solc/`.
