---
title: 'A hardhat-deploy v1 script that fails points to the migration guide'
slug: v1-script-migration-help
spec: rocketh-playground
needsAnswers: true
blockedBy: []
covers: [5]
---

<!-- open-questions -->

## Open questions

1. What should the reader see? For example: a link to rocketh.dev's migration guide in the transcript when a script fails in a way a v1-style script does (which failures count?), a "Migrating from v1" link always visible beside the editor, or the guide in a pane next to the editor.
2. Is a "paste a v1 script" sample part of it, and if so where does the reader find it?

<!-- /open-questions -->

## What to build

Story 5: a hardhat-deploy v1 user pastes a v1-style deploy script, sees where it fails, and fixes it with the migration guide beside them, so they know what moving to v2 costs. What the page shows is the open question; the failure itself already appears in the transcript as rocketh prints it.

## Acceptance criteria

- [ ] A v1-style deploy script (the shape of hardhat-deploy v1's `DeployFunction`) run in the playground fails with a message that leads to the migration guide, as the answer to the open question decides (e2e).
- [ ] Tests cover the new behaviour.

## Blocked by

- None: can start immediately.

## Prompt

> Goal: help a v1 user migrate. rocketh's migration documentation is in the rocketh repository's `documentation/` (published at rocketh.dev). Answer the open questions before building.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts and Transactions views), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
