---
title: "The e2e suite steps aside from ports another run holds"
slug: e2e-free-ports
spec: rocketh-playground
humanOnly: true
blockedBy: []
covers: [18]
---

## What to build

`pnpm verify` runs the Playwright suite on the fixed ports 4273 and 4274 (`web/e2e/ports.ts`, with `reuseExistingServer: false` in `web/playwright.config.ts`, so a busy port fails the run outright). On a shared machine another project's e2e run can hold them: `share-link`'s gate failed twice that way (`work/notes/observations/e2e-default-ports-shared.md`). Make the suite pick free ports by itself when `E2E_GATEWAY_PLAIN_PORT` / `E2E_GATEWAY_SW_PORT` are not set, so a busy port never fails a run, while a set variable is still used as given (and still fails loudly when busy). The tests read the URLs from `ports.ts`, so the chosen ports must reach both the config's `webServer` entries and the test workers (for example chosen once in the config and passed through the environment). Playwright evaluates the config again in each worker, so the config must reuse a port it already wrote to `process.env` rather than pick again; `web/` is `"type": "module"`, so a top-level `await` for the free-port probe is available.

`web/e2e/ports.ts` is the template's file, byte-identical to `template-svelte-shadcn`'s, and the template has the same problem, so this is a generic change: it is made first as a pull request on `template-svelte-shadcn`, then comes down to this repository through `stem` (see this repository's AGENTS.md, "Generic changes go to the template first"). This task is done when that change has come down and `pnpm verify` here passes with something else listening on 4273 and 4274.

## Acceptance criteria

- [ ] With nothing set and 4273 and 4274 both held by another process, `pnpm verify` passes, its servers on free ports.
- [ ] With `E2E_GATEWAY_PLAIN_PORT` / `E2E_GATEWAY_SW_PORT` set, those ports are used; a busy one still fails the run with a message naming it.
- [ ] The change is in `template-svelte-shadcn` first and arrives here through `stem`; `work/notes/observations/e2e-default-ports-shared.md` is removed once it has.

## Blocked by

- None: can start immediately.

## Prompt

> Goal: let the e2e suite pick free ports. The change belongs to the template: open it as a pull request on `template-svelte-shadcn`, then bring it down through `stem`.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means the template's change has been merged here from `stem`, `pnpm verify` is green with 4273 and 4274 held by another process, and `work/notes/observations/e2e-default-ports-shared.md` is removed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
