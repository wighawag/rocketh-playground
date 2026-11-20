---
title: 'A hardhat-deploy v1 script that fails points to the migration guide'
slug: v1-script-migration-help
spec: rocketh-playground
blockedBy: [share-link]
covers: [5]
---

## Answers (maintainer, 2026-11-20)

1. Two things. (a) When a run fails in a way a v1-style script does (see 3), the transcript adds a line after rocketh's own error saying this looks like a hardhat-deploy v1 script and linking to rocketh.dev's migration guide (find its page in the rocketh repository's `documentation/`; link the published rocketh.dev URL). (b) A small "Migrating from hardhat-deploy v1?" link to the same guide, always visible (in the header or beside the editor), opening in a new tab. No guide pane.
2. No "paste a v1 script" sample: the reader brings their own script; the guide is the help.
3. Recognise both failures: the module loader refusing an import of `hardhat-deploy/types` or `hardhat/types` (or another v1-only module such as `hardhat-deploy` v1 entry points), and a TypeError reading `deployments`/`getNamedAccounts` on the `hre` argument. The recognition is plain `.ts`, tested in node on the actual error text the runner produces for each shape; the e2e test runs one real v1-style script.
4. Blocked by `share-link`, the last task still to be built in the persist, reset, download and share chain that also edits the header, the session and the transcript.

## What to build

Story 5: a hardhat-deploy v1 user pastes a v1-style deploy script, sees where it fails, and fixes it with the migration guide beside them, so they know what moving to v2 costs. What the page shows is the open question; the failure itself already appears in the transcript as rocketh prints it.

## Acceptance criteria

- [ ] A v1-style deploy script (the shape of hardhat-deploy v1's `DeployFunction`) run in the playground shows the reader the way to the migration guide, as a transcript line linking rocketh.dev's migration guide, after rocketh's own error (e2e).
- [ ] Both failure shapes (a refused v1 import, a TypeError on `hre.deployments`) are recognised, and an ordinary script error is not (node test, on the runner's real error text).
- [ ] A "Migrating from hardhat-deploy v1?" link to the guide is always visible.
- [ ] Tests cover the new behaviour.

## Blocked by

- `share-link`

## Prompt

> Goal: help a v1 user migrate. rocketh's migration documentation is in the rocketh repository's `documentation/` (published at rocketh.dev). The open questions are answered above; build to those answers.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.

## Decisions

- **The guide link is `https://rocketh.dev/hardhat-deploy/migration/`** ("Coming from hardhat-deploy v1: what changed"). It is the page the rocketh `documentation/index.md` sends v1 users to, and it links on to the step-by-step guide. The page is `hardhat-deploy/migration/index.md` at the rocketh repository's root, not under `documentation/`; the published URL answered 200. Alternative: link `/hardhat-deploy/migration/step-by-step/` directly.
- **The modules treated as v1-only are `hardhat`, `hardhat-deploy`, any subpath of either, and `hardhat-deploy-ethers`.** Matching is on the exact package name, so packages that merely start with "hardhat" (such as `hardhat-gas-reporter`) are not counted. `ethers` and `@nomiclabs/*` are left out because they are not proof of a v1 script. This touches nothing outside `migration.ts`.
- **A TypeError counts as v1 when its message names `getNamedAccounts`, `getUnnamedAccounts`, `getChainId` or `deployments`.** This relies on the names in the message rather than on browser-specific wording, so it does not depend on V8's phrasing. An ordinary TypeError such as "Cannot read properties of undefined" does not match.
- **A `module.exports = async (...) => {...}` script is not recognised.** It fails with the playground's own error, "has no default export made with deployScript(...)", which the task did not list as one of the two shapes. Alternative: also recognise that message.
- **The hint is a `playground`-source transcript line with an optional `link`** (a URL and a label) on `TranscriptLine`, rendered by `Transcript.svelte`. Alternative considered: making any URL in a line's text clickable. That would also turn URLs in rocketh's or the reader's own logs into links, so I did not do it.
- **The header link sits at the start of the right-aligned info group** (beside the compiler and TypeScript versions), as small underlined text.
