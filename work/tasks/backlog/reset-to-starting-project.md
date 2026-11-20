---
title: 'Reset gives the starting project on a fresh chain'
slug: reset-to-starting-project
spec: rocketh-playground
blockedBy: [persist-project-files]
covers: [10]
---

## What to build

A Reset button in the header returns the playground to its first visit: the starting project's files, a fresh chain at block 0, and no deployment records, with the saved copies of all three cleared, so a reload after Reset also shows the starting project. Reset asks for confirmation first (it throws away the reader's edits and chain), says in the transcript what it did, and is disabled while a run or a write is in progress. Everything that shows the chain follows it: the block number, the contract list, the Contracts and Transactions views.

## Acceptance criteria

- [ ] After a Deploy and an edit, Reset (confirmed) shows the starting files, `chain at block 0`, no records, and a Deploy then sends 1 transaction (e2e).
- [ ] Cancelling the confirmation changes nothing.
- [ ] A reload after Reset shows the starting project on block 0.
- [ ] Reset is disabled while the phase is running, stopping or sending.
- [ ] The session exposes reset as an action, tested in node: the files, records, block number and saved stores are back to a first visit.
- [ ] Tests cover the new behaviour (mirror the existing session and e2e tests).

## Blocked by

- `persist-project-files`

## Prompt

> Goal: Reset. The chain lives in the EVM worker (webevm, persisted in IndexedDB inside that worker), the records in the runner's deployment store, the files in the files store the task `persist-project-files` added: find how each is created in `session.ts` and the worker hosts, and how each can be cleared or recreated. Stop already restarts the runner without touching the chain; Reset is the one action that does touch it. A confirmation dialog exists in the UI kit (`web/src/lib/shadcn/ui/dialog`).
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts and Transactions views), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
