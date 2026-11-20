---
title: 'A test installs the exported project and deploys it'
slug: export-installs-and-deploys
spec: rocketh-playground
blockedBy: [download-project-zip]
covers: [19]
---

## Answers (maintainer, 2026-11-20)

1. A separate script, NOT inside `pnpm verify`: `pnpm test:export` at the repository root (forwarding to `web/`), run by hand and later by `follow-rocketh-releases`' workflow. `verify` stays offline-capable and fast, so this no longer touches the `verify` script and is no longer blocked by `bundle-budgets`. Document how to run it in `web/src/lib/playground/README.md`.
2. Run it under vitest, with its own config (for example `web/vitest.export.config.ts`, so the normal `pnpm test` does not pick it up) and a long timeout, so the zip builder keeps reading the template through `import.meta.glob` unchanged.
3. It exports TWO projects and installs and deploys each: the starting project, and one whose `contracts/Counter.sol` the reader changed (for example a renamed function and a constructor argument, with the deploy script updated to match), which proves leaving out the template's Counter tests keeps `pnpm hardhat compile` working.

## What to build

A test that takes the zip Download produces for the starting project, unzips it into a temporary folder, and runs `pnpm i`, `pnpm hardhat compile` and `pnpm hardhat deploy` (hardhat's in-memory network), failing if any step fails. It is what keeps the export from rotting as rocketh releases move. Prior art: rocketh's `test:docs:hardhat-deploy-init` (`scripts/test-doc.sh` in the rocketh repository) does the same for `hardhat-deploy init`.

## Acceptance criteria

- [ ] The test passes on the starting project and fails, naming the step, when the export is broken (for example a package pinned to a version that does not exist).
- [ ] It writes nothing to shared locations: the pnpm store (`--store-dir` or `npm_config_store_dir` inside the temporary folder) and hardhat's compiler cache (`XDG_CACHE_HOME` inside it) point into the temporary folder, the test asserts the real ones are untouched, and it removes the folder.
- [ ] It runs as `pnpm test:export` (from the repository root), under vitest with its own config, and is not part of `pnpm verify` or `pnpm test`.
- [ ] It also passes on an export whose `contracts/Counter.sol` was changed (Counter tests left out by the export).

## Blocked by

- `download-project-zip`

## Prompt

> Goal: prove the export installs and deploys. Build on the zip function from `download-project-zip` rather than on the UI. The open questions are answered above; build to those answers.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- **The child commands use whatever `pnpm` is on `PATH`, with a reader's environment, not the test run's.** The exported project has no `packageManager` field, so a reader gets their own pnpm (pnpm 11.25.0 on the machine this was built on). Before spawning, the test drops `npm_*`, `PNPM_*`, `VITEST*`, `INIT_CWD`, `NODE_ENV`, `TEST` and any `node_modules` folder on `PATH`. The alternative was to pin the repository's pnpm 10.28.1, but that is not what a reader runs.
- **The store is redirected with both `pnpm_config_store_dir` and `npm_config_store_dir`.** pnpm 11 ignores `npm_config_store_dir`, which is the variable the task names. The test's own `pnpm store path` assertion caught this: with only that variable, pnpm 11 used the real store. All four XDG folders (cache, config, data, state) are also moved inside the temporary folder, so pnpm's metadata cache and hardhat's config stay out of the user's folders too.
- **"The real ones are untouched" means: no file this run wrote below its temporary store or hardhat cache was also written below the real ones during the run.** It compares modification times only. Comparing change times would fail whenever any other project hard-links a store file. A snapshot of the whole real folder was rejected because unrelated installs on the machine would make it fail. The limit of this choice is noted in the README.
- **One temporary folder holds a shared store and cache for the three cases.** The second install reuses the store instead of downloading again. The broken-export case sits in the same folder, so it is cleaned up and checked the same way.
- **The broken-export case is a permanent part of `pnpm test:export`, not a one-off check.** The failure path stays tested as releases move, at the cost of one fast failing install.
