---
title: 'A scheduled workflow follows rocketh releases'
slug: follow-rocketh-releases
spec: rocketh-playground
humanOnly: true
blockedBy: [export-installs-and-deploys]
covers: [17]
---

## What to build

The spec's decision "Following rocketh releases": a scheduled GitHub workflow in this repository checks npm for new versions of the rocketh packages `web/package.json` pins, bumps them, refreshes the starting project and the declarations, runs the playground's tests and the export test, and opens a pull request a human merges. Auto-merge is out until the gate has proved itself. It is humanOnly by nature: it is a CI workflow that needs a token allowed to open pull requests, and the maintainer approves every CI workflow and repository setting.

## Acceptance criteria

- [ ] Run by hand on a branch with an outdated pin, it opens a pull request bumping it, with the tests and the export test green.
- [ ] With nothing new on npm it opens nothing.
- [ ] Its permissions are the least that work, each granted per job.

## Blocked by

- `export-installs-and-deploys`

## Prompt

> Goal: the release-following workflow, built with the maintainer. The existing `.github/workflows/pages.yml` shows the repository's workflow style (pinned action SHAs, per-job permissions). The refresh scripts are `web/scripts/update-project-template.mjs` and the declarations build in `web/vite.playground.ts`.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts and Transactions views), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
