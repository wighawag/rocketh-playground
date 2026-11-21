---
title: 'Deploy scripts that use @rocketh/router run in the playground'
slug: runner-resolves-rocketh-router
spec: open-in-playground
needsAnswers: true
blockedBy: []
covers: [2]
---

<!-- open-questions -->

## Open questions

1. Approve `@rocketh/router` as a dependency of `web/package.json`, pinned exactly like the other `@rocketh/*` packages? It is rocketh's own package, needed so rocketh.dev's routers page can open here.

<!-- /open-questions -->

## What to build

`runner/bare-modules.ts` resolves `rocketh`, `@rocketh/deploy`, `@rocketh/proxy`, `@rocketh/diamond`, `@rocketh/read-execute`, `@rocketh/viem`, `@rocketh/unknown-signer`, `@rocketh/signer`, `@rocketh/web` and viem, but not `@rocketh/router` (`deployViaRouter`), which rocketh.dev's `documentation/routers/` page uses. Add it the way the others are: pinned in `web/package.json`, a lazy chunk in the registry, its declarations in the TypeScript worker's build asset (`scripts/declarations.mjs`), and followed by the release follower (`scripts/follow-releases.mjs`).

## Acceptance criteria

- [ ] A project whose `rocketh/config.ts` registers `@rocketh/router` and whose deploy script calls `deployViaRouter` deploys in the playground (node test through the runner, as the existing runner tests do).
- [ ] The editor types `deployViaRouter` (no "cannot find module" diagnostic).
- [ ] The release follower checks `@rocketh/router` with the others.
- [ ] Bundle budgets still pass, or the budget change is stated and justified in the report.
- [ ] `pnpm verify` is green.

## Blocked by

- None. Can start immediately once the question is answered.

## Prompt

> Goal: make `@rocketh/router` resolvable in the runner, for spec `open-in-playground` (`work/specs/tasked/open-in-playground.md`). Read `AGENTS.md` and `web/src/lib/playground/README.md` (the runner, declarations, bundle budgets and release-follower bullets), and follow how `@rocketh/proxy` is wired today, end to end. Done means `pnpm verify` is green with a test that a router deploy runs.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
