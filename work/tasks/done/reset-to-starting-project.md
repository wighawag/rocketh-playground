---
title: 'Reset gives the starting project on a fresh chain'
slug: reset-to-starting-project
spec: rocketh-playground
blockedBy: [persist-project-files]
covers: [10]
---

## What to build

A Reset button in the header returns the playground to its first visit: the starting project's files, a fresh chain at block 0, and no deployment records, with the saved copies of all three cleared, so a reload after Reset also shows the starting project. Reset asks for confirmation first (it throws away the reader's edits and chain), says in the transcript what it did, and is disabled while a run or a write is in progress. Everything that shows the chain follows it: the block number, the contract list, the Contracts view, and the Transactions view if it has landed (pull request #7).

## Acceptance criteria

- [ ] After a Deploy and an edit, Reset (confirmed) shows the starting files, `chain at block 0`, no records, and a Deploy then sends 1 transaction (e2e).
- [ ] Cancelling the confirmation changes nothing.
- [ ] A reload after Reset shows the starting project on block 0.
- [ ] Reset is enabled only when the phase is `ready` (a Reset during a compile, a run or a write could let that work land on the fresh chain).
- [ ] After Reset the editor shows no stale diagnostics (the language service and the artifact types are given the starting files), and a Contracts or Transactions view that was open closes.
- [ ] The session exposes reset as an action, tested in node: the files, records, block number and saved stores are back to a first visit.
- [ ] Tests cover the new behaviour (mirror the existing session and e2e tests).

## Blocked by

- `persist-project-files`

## Prompt

> Goal: Reset. The chain lives in the EVM worker (webevm, persisted in IndexedDB inside that worker), the records in the runner's deployment store, the files in the files store the task `persist-project-files` added: find how each is created in `session.ts` and the worker hosts, and how each can be cleared or recreated. Stop already restarts the runner without touching the chain; Reset is the one action that does touch it. A confirmation dialog exists in the UI kit (`web/src/lib/shadcn/ui/dialog`).
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- The chain is reset by starting a new node with a `fresh` option (`EVMNodeOptions.fresh` in `web/src/lib/playground/evm/evm-host.ts`). The node is told nothing is saved, and its block-0 state is saved over the chain database before it is handed back. The other option was deleting the IndexedDB database. That waits forever while any connection is open, and webevm's adapter never closes its own, so the delete would hang. Overwriting the record works with webevm 0.9.1's published API unchanged.
- The deployment records are reset by restarting the runner with `fresh` on its `init` message (`runner/protocol.ts`). It empties the store (`vfs.restore({})`) and waits for the save before it reports `ready`. The runner has to be restarted anyway, because its provider is a port the old node served. So this extends the restart Stop already does rather than adding a new message.
- The session gets a new phase, `resetting` (label "Resetting"). Like `deploy`, `reset()` silently does nothing outside `ready`, rather than throwing as `transact` does, because the button is already disabled then.
- The transcript is kept, not cleared, and Reset adds the line "Reset: the starting project, a new chain at block 0 and no deployment records. Your edits and the old chain are gone." The reader's run history stays readable, and the task asks for the transcript to say what Reset did. The diagnostics, the last run and the named accounts are cleared, as on a first visit. The alternative was an empty transcript, which would match a first visit more literally.
- After Reset the first deploy script is selected (and saved as the selection), as on a first visit, even if the reader had another file open.
- The page closes an open Contracts or Transactions view as soon as Reset is confirmed, before the reset finishes. That UI state is local to `Playground.svelte`, which is where the closing happens.
- If Reset fails partway, the session goes to `failed` with "The playground could not reset: ..." in the transcript, as a failed start does. There is no rollback, because the old chain and records are already gone by then.
- `TypeScriptWorkerApi` gains `removeFiles(paths)`, which wraps the language service's existing `deleteFile`. `setFiles` only adds or updates, so without it a file the reader had added would stay in the type program after Reset.
