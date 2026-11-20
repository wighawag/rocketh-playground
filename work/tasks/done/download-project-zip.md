---
title: 'Download the project as a hardhat-deploy project zip'
slug: download-project-zip
spec: rocketh-playground
blockedBy: [reset-to-starting-project]
covers: [13, 17, 18]
---

## What to build

A Download button in the header saves the reader's project as a zip that is a hardhat-deploy project, ready for `pnpm i && pnpm hardhat compile && pnpm hardhat deploy`. The zip holds the project files as the reader has them (they started as the published `hardhat-deploy init` template, `web/project-template/`), with `workspace:*` in its package.json replaced by the published hardhat-deploy version, and every package that is in both the template's package.json and `web/package.json` pinned to exactly the version the playground runs, so what ran in the tab is what installs (the template's other packages keep its ranges, and no package is added). The template's own README is kept, with a short section at its top saying the project comes from the rocketh playground and naming the commands, and states MIT (the template's licence; only this repository's own code is AGPL-3.0). It never contains a test key (the playground injects them at run time and never writes them into a file; the test proves it) and never contains the deployment records (their chain only existed in the tab). The zip is built with `fflate`, which the spec's Decisions approve: add it to `web/package.json`. Building the zip is plain `.ts`, loaded on demand when Download is pressed, not with the page.

## Acceptance criteria

- [ ] A node test builds the zip from the starting project and from an edited one, unzips it, and checks: the file list (project files, README with the commands, licence statement), no `deployments/`, no test key string anywhere, `workspace:*` gone, every package in both the template and `web/package.json` pinned to the latter's exact version, and no package added.
- [ ] The e2e test presses Download and receives a zip whose files include the reader's edit.
- [ ] The page bundle's first load does not grow by fflate (it loads on demand); measure the first load before and after and report both.
- [ ] Tests cover the new behaviour.

## Blocked by

- `reset-to-starting-project`

## Prompt

> Goal: Download. The starting project and how it is refreshed are in `web/src/lib/playground/project/template.ts` and `scripts/update-project-template.mjs`; the test keys are `runner/test-keys.ts`. The spec's "Export and share" section and its Licence decision bind the content. The hardhat-deploy version that replaces `workspace:*` is `TEMPLATE_SOURCE.version` in `project/template.ts` (from `web/project-template.json`). The template carries files the reader never opens, such as `contracts/Counter.t.sol` and `test/Counter.ts`: a reader who renamed Counter's functions would get a project whose tests no longer build. Decide whether those are kept as the reader has them, and record the choice.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- **The Counter tests are kept while Counter is the template's, and dropped once the reader changed it.** `contracts/Counter.t.sol` and `test/Counter.ts` stay in the zip while `contracts/Counter.sol` is unchanged. Once the reader has changed it, both are left out and the README says so. The reason: Hardhat 3's `build` (which `compile` runs) also compiles Solidity tests, so a test calling a renamed function would stop `pnpm hardhat compile`. The reader never sees these files, so they lose nothing they know of. Alternatives considered: always keep them, which can break the promised commands; always drop them, which loses working tests for an unchanged project; or decide by checking the edit's compatibility, which would be complex and unreliable.
- **Only exact versions in `web/package.json` count as "the version the playground runs".** A package that `web/package.json` gives only a range keeps the template's range. Today that is only `@types/node` (`^26.2.0` there, `^25.0.10` in the template), and nothing in the tab runs it. The alternative was copying `^26.2.0` into the export, which would quietly change the template's choice for no reason. The node test asserts this rule.
- **The zip unzips into one folder.** Both the file and the folder are named `rocketh-playground-project`, so unzipping never spills files into the current directory. The template's `package.json` name is left unchanged.
- **The licence is stated in the README, not in a new file.** It goes in a `## Licence` section of the added README section. No LICENSE file and no `license` field in `package.json` are added: the task limits `package.json` to version changes, and the template ships no licence file to copy.
- **Any `deployments/` path among the files is left out of the zip, as a safeguard.** The session keeps records apart from files today.
- **A template dependency on `workspace:` other than hardhat-deploy is refused with an error.** This way a template refresh that adds one fails the export test instead of shipping something that cannot install. It touches `scripts/update-project-template.mjs` refreshes.
- **Download is offered in every phase except `idle`, `booting` and `resetting`, `failed` included.** Before `booting` ends the reader's files are not open yet, and during `resetting` they are being replaced. A failed session still holds the reader's work, so it can still be downloaded.
