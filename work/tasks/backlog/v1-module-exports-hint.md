---
title: "A module.exports v1 script also points to the migration guide"
slug: v1-module-exports-hint
spec: rocketh-playground
blockedBy: []
covers: [5]
---

## What to build

`v1-script-migration-help` added a transcript line linking rocketh.dev's migration guide when a run fails the way a hardhat-deploy v1 deploy script does (`web/src/lib/playground/migration.ts`, `looksLikeV1Script`), for two shapes: a refused import of a v1-only module, and a TypeError on v1's `hre` API. A v1 script written as `module.exports = async (hre) => {...}` (or `export default async function (hre) {...}` without `deployScript`) fails earlier, with the playground's own error that the script "has no default export made with deployScript(...)", and gets no hint. Recognise that failure too, when the script's text looks like a v1 deploy function: it is the runner's own error, so match its exact wording from the runner (not a guess), and only add the hint when the script is shaped like v1 (for example it takes `hre` or reads `deployments` / `getNamedAccounts`), so a reader who simply forgot `deployScript` in a v2 script gets the existing error alone.

## Acceptance criteria

- [ ] A `module.exports = async (hre) => {...}` v1 script shows rocketh's or the playground's error, then the migration guide line (node test on the runner's real error text, and e2e).
- [ ] A v2-style script missing `deployScript(...)` that does not look like v1 gets no hint.
- [ ] The two existing shapes are still recognised and the ordinary errors still are not (`test/lib/playground/v1-script.test.ts`).
- [ ] `web/src/lib/playground/README.md` says which failures get the hint.

## Blocked by

- None: can start immediately.

## Prompt

> Goal: extend the v1 migration hint to scripts that fail before rocketh runs them.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
