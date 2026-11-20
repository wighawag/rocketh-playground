---
title: 'A test installs the exported project and deploys it'
slug: export-installs-and-deploys
spec: rocketh-playground
needsAnswers: true
blockedBy: [download-project-zip]
covers: [19]
---

<!-- open-questions -->

## Open questions

1. Where does this test run? It needs the network (`pnpm i`) and takes minutes. Options: inside `pnpm verify` (which would no longer work offline), as a separate script run by hand, or in a CI workflow (adding one needs the maintainer's approval).

<!-- /open-questions -->

## What to build

A test that takes the zip Download produces for the starting project, unzips it into a temporary folder, and runs `pnpm i`, `pnpm hardhat compile` and `pnpm hardhat deploy` (hardhat's in-memory network), failing if any step fails. It is what keeps the export from rotting as rocketh releases move. Prior art: rocketh's `test:docs:hardhat-deploy-init` (`scripts/test-doc.sh` in the rocketh repository) does the same for `hardhat-deploy init`.

## Acceptance criteria

- [ ] The test passes on the starting project and fails, naming the step, when the export is broken (for example a package pinned to a version that does not exist).
- [ ] It leaves nothing outside its temporary folder, and removes that folder.
- [ ] It runs where the answer to the open question says.

## Blocked by

- `download-project-zip`

## Prompt

> Goal: prove the export installs and deploys. Build on the zip function from `download-project-zip` rather than on the UI. Answer the open question before building.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts and Transactions views), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
