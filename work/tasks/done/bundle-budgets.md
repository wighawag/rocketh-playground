---
title: 'Bundle budgets checked on every verify'
slug: bundle-budgets
spec: rocketh-playground
blockedBy: [share-link]
covers: [20]
---

## What to build

A check, run by `pnpm verify` after the build, that fails when a bundle grows past its stated budget, so a dependency that doubles the first load is noticed. It measures, raw and gzip, from the build's manifest: the page's first load (the static import closure of the app's entries and the root page), each view loaded on demand (Contracts, the Transactions view if pull request #7 has landed, and the Download and Share code), each worker (TypeScript, compiler, EVM, runner), the runner's per-package lazy chunks (`runner/bare-modules.ts`), the TypeScript worker's declarations asset (`typescript/generated/declarations.json`), and the shipped soljson. Each budget is the size measured when the check lands plus 10%, written in the check with the date it was measured, so raising one is a visible, reviewed edit. The failure names the bundle, its size and its budget.

## Acceptance criteria

- [ ] `pnpm verify` runs the check after `web:build` and it passes on the current build.
- [ ] Raising a bundle past its budget (for example importing a large module into the page) makes it fail with the bundle's name, size and budget.
- [ ] The budgets and how to measure are documented in `web/src/lib/playground/README.md`.

## Blocked by

- `share-link`

## Prompt

> Goal: bundle budgets. The build's client manifest is `web/.svelte-kit/output/client/.vite/manifest.json`; a first-load closure follows each entry's `imports` from the app entries and the root page's node, and an on-demand closure follows a `dynamicImports` target minus what the first load already has. Workers are emitted as their own chunks (find them through the worker imports in `web/src/lib/playground/workers.ts`). Unit tests run BEFORE the build in `pnpm verify`, so this check is a step after the build, not a unit test.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- **The budget table records the measurement and its date, not the budget itself.** Each entry is `m(raw, gzip, 'YYYY-MM-DD')`, and the budget is worked out as `ceil(size × 1.1)` (`HEADROOM`). Raising a budget means re-measuring with `--measure` and editing one line, and the error message shows the measured size, the date and the +10%. The alternative was to write the +10% numbers directly, which hides what was actually measured. This touches only `scripts/bundle-budgets.mjs`.
- **Workers are measured by reading the emitted files, with no new build plugin.** A worker build has no Vite manifest. So each worker's entry is found by name (`workers/<name>.worker-<hash>.js`, names taken from `workers.ts`), and its closure comes from length-bounded regexes over the files' relative `from"./x.js"` / `import("./x.js")` imports. Runner packages are named from the entry's `"<pkg>":()=>import("./chunks/...")` table. If the minified output changes shape, the check fails loudly with "budget with no bundle"; it cannot pass silently. The alternative was a worker plugin in `vite.playground.ts` that writes a chunk graph, which is more robust to minifier changes but changes the build to serve a check.
- **On-demand parts are every dynamic import reachable from the first load**, except SvelteKit's own `.svelte-kit/generated/*` nodes, not only the four named views. A dependency that brings a new lazy chunk into reach (as viem did in the trial above) therefore needs its own budget. The alternative, measuring only the named views, would miss those. A bundle that loads on demand is measured from cold: its closure minus the first load, so Share's entry includes fflate even though Download may already have loaded it.
- **Budgets are kept per runner package (33 entries)**, each package's closure minus the runner's own, rather than one total. A failure then names the package that grew. Chunks shared between packages are counted in each package, since that is what loading it from cold costs.
- **gzip is measured at level 9**, the same as `docs/spikes/persist-project-files/measure-first-load.mjs`, so the figures match the README's earlier measurements.
- **The script is formatted at print width 140**, like the playground's other files (prettier's configured 80 would split each one-line budget entry).
