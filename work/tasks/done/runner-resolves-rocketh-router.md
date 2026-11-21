---
title: 'Deploy scripts that use @rocketh/router run in the playground, and Download adds every package a project imports'
slug: runner-resolves-rocketh-router
spec: open-in-playground
blockedBy: []
covers: [2]
---

## Answers (maintainer, 2026-11-20)

1. `@rocketh/router` is approved as a dependency of `web/package.json`, pinned exactly like the other `@rocketh/*` packages.
2. Download must not drop a package the project uses. It writes the template's `package.json` and today only re-pins versions ("no package is added", `project/export-project.ts`), while the template depends on `@rocketh/proxy` but not `@rocketh/router` or `@rocketh/diamond`. So a project whose config imports `@rocketh/diamond` deploys in the tab and its download fails on `pnpm hardhat deploy` with "Cannot find package". Decided: dependencies are declared by importing them. Download adds every package the project's files import (the TypeScript worker already reports each file's run-time imports) that is not in the template's `package.json`, at the exact version the playground runs it at. This replaces the "no package is added" rule of `work/specs/tasked/rocketh-playground.md` for packages the project imports.

## What to build

`runner/bare-modules.ts` resolves `rocketh`, `@rocketh/deploy`, `@rocketh/proxy`, `@rocketh/diamond`, `@rocketh/read-execute`, `@rocketh/viem`, `@rocketh/unknown-signer`, `@rocketh/signer`, `@rocketh/web` and viem, but not `@rocketh/router` (`deployViaRouter`), which rocketh.dev's `documentation/routers/` page uses. Add it the way the others are: pinned in `web/package.json`, a lazy chunk in the registry, its declarations in the TypeScript worker's build asset (`scripts/declarations.mjs`), and followed by the release follower (`scripts/follow-releases.mjs`).

Then make Download add what the project imports (answer 2): every bare package imported by a project file and missing from the template's `package.json` is added to `dependencies`, or `devDependencies` where the template keeps its rocketh packages (follow the template), pinned to the version the playground runs. A package the runner does not resolve cannot be imported in the first place, so this never adds a package the tab did not run. The export's README line about versions still holds.

## Acceptance criteria

- [ ] A project whose `rocketh/config.ts` registers `@rocketh/router` and whose deploy script calls `deployViaRouter` deploys in the playground (node test through the runner, as the existing runner tests do).
- [ ] The editor types `deployViaRouter` (no "cannot find module" diagnostic).
- [ ] The release follower checks `@rocketh/router` with the others.
- [ ] A project whose config imports `@rocketh/router` (and one importing `@rocketh/diamond`) downloads with that package in `package.json` at the pinned version, and `pnpm test:export` installs and deploys such a project (extend the export test with one).
- [ ] A project that imports nothing beyond the template's packages downloads exactly as before.
- [ ] `web/src/lib/playground/README.md`'s Download bullet states the rule.
- [ ] Bundle budgets still pass, or the budget change is stated and justified in the report.
- [ ] `pnpm verify` is green.

## Blocked by

- None. Can start immediately once the question is answered.

## Prompt

> Goal: make `@rocketh/router` resolvable in the runner, and make Download add every package a project imports, for spec `open-in-playground` (`work/specs/tasked/open-in-playground.md`). Read `AGENTS.md` and `web/src/lib/playground/README.md` (the runner, declarations, bundle budgets and release-follower bullets), and follow how `@rocketh/proxy` is wired today, end to end. Done means `pnpm verify` and `pnpm test:export` are green, with a test that a router deploy runs and an export test for a project importing a package the template lacks.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.

## Decisions

- **Imports are read from the files' text, not from the TypeScript worker's run-time imports.** `importedPackages` matches `import ... from`, `export ... from`, `import '...'`, `import()` and `require()` in `.ts`/`.js` files. The answer suggested the worker's reports. Reading the files instead keeps Download a pure function of them: it still works in a session that failed to start (Download is offered then), and the node export test needs no transpile. A specifier inside a comment could be matched, but only a package with an exact pin can be added, so the worst case is an extra pinned package. Alternative considered: have the session ask the worker at Download time. Touches only `project/export-project.ts`.
- **Type-only imports count.** A project that imports only `@rocketh/diamond/types` gets `@rocketh/diamond`: the downloaded project needs the package to type that file, though `pnpm hardhat deploy` alone would not. Alternative: run-time imports only, as the worker reports them.
- **Only packages `web/package.json` pins exactly are added.** "The version the playground runs" needs an exact pin. An import with no pin (such as `left-pad`, which the runner refuses anyway) is not added. A test checks that every package the runner resolves has an exact pin, so whatever ran in the tab is always added. A package pinned in `web/package.json` that the runner does not resolve (such as `comlink`) would be added if a file imports it. The runner's list could not be imported into the export module, because that module ships on the page and the list pulls in every runner package chunk. Touches `PLAYGROUND_VERSIONS`.
- **Added packages go in the section where the template keeps `rocketh`** (`devDependencies` today; `dependencies` if it has none), and that section's keys are re-sorted only when a package is added. That follows the template, as the task says, and leaves an export that adds nothing byte-identical to before.
- **The declarations budget was raised rather than trimmed.** See the budget numbers above; the reason is in the budget line in `scripts/bundle-budgets.mjs` and in the README. Alternative: stub or trim solidity-proxy's artifact types in `scripts/declarations.mjs`, which would make the editor's types differ from the published package.
