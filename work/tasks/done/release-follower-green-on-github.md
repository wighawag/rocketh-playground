---
title: "The release follower's checks pass on GitHub's runners"
slug: release-follower-green-on-github
spec: rocketh-playground
blockedBy: [follow-rocketh-releases]
covers: [17, 19]
---

## What to build

The release follower (`.github/workflows/follow-rocketh-releases.yml`) was run by hand on a branch with `rocketh` pinned one release back (run 44780222082). It found the bump, updated the lockfile and installed, then `pnpm verify` failed, so it rightly opened nothing. These are the first runs of the playground's own tests on GitHub's runners (`pages.yml` only builds), and they failed for two reasons that do not show on a developer machine:

1. `web/test/export/install-export.test.ts` expected `"pnpm i" failed` and got `"pnpm i" could not start: spawn pnpm ENOENT`. `readerEnv` in `web/test/export/install-export.ts` drops every `PATH` entry with a `node_modules` segment, so that the repository's own binaries are not passed on. On the runner, `pnpm/action-setup` installs pnpm in `/home/runner/setup-pnpm/node_modules/.bin` (`PNPM_HOME`), so pnpm itself is dropped. Drop only the entries inside this repository (its root's and `web/`'s `node_modules/.bin`, and any under the repository root), not every directory named `node_modules`. Keep the reason in the comment. `pnpm test:export` in the workflow would fail the same way, so this fixes both.
2. `web/test/lib/playground/session.test.ts` "boots, deploys the starting project, and shows its records" timed out at vitest's default 5000 ms. It is the first test to boot a whole session (the compiler, TypeScript, the EVM node, the runner), and a cold runner is slower than a developer machine. Give the tests that boot a session a timeout that fits a cold machine, stated once (for example a file-level or describe-level timeout), not only that one test, and say why in a comment.

Run `pnpm verify` with `CI=true` set (as on GitHub, which also turns on Playwright's retries and `forbidOnly`) and fix anything else that only fails there.

## Acceptance criteria

- [ ] `readerEnv` keeps a `PATH` entry that holds pnpm outside the repository and drops the repository's own `node_modules/.bin`; a unit test in `install-export.test.ts` covers both, with a `PATH` shaped like the runner's.
- [ ] The session tests that boot a whole session have a timeout fit for a cold runner, set once, with the reason in a comment.
- [ ] `pnpm verify` passes, and passes with `CI=true`.
- [ ] After merge (the conductor, not the build): the release follower dispatched on a branch with `rocketh` one release back passes `check` and opens a pull request.

## Blocked by

- `follow-rocketh-releases`

## Prompt

> Goal: make the playground's own tests pass on GitHub's runners, so the release follower can open its pull request.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md`, and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green, also with `CI=true`, with the new tests in it.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- "Inside the repository" means "at or under the repository root once resolved", not a fixed list of `.bin` folders. It covers the root's and `web/`'s `node_modules/.bin`, the `.pnpm` bins, and pnpm's relative `./node_modules/.bin`. Empty and relative entries are resolved against the test's working directory, which is inside the repository, so they are dropped too, as they were before. Alternative: list the two `.bin` folders by name, which would miss the `.pnpm` and relative ones. Touches only `pnpm test:export` and its offline unit tests.
- `readerEnv` takes the repository root as an optional second parameter, which defaults to the root computed from the file's location. This lets the unit test describe a runner's layout without depending on where the checkout actually is. Alternative: read the root from an environment variable, which a reader's shell does not have.
- The session timeout is 60 s, set at the describe level. That is about ten times what a developer machine needs, and still finishes a genuine hang well within the workflow's 90-minute `timeout-minutes`. Hook timeouts stay at vitest's default, because disposing a session does not boot anything.
