---
title: 'Share the project as a link that does not run until Deploy'
slug: share-link
spec: rocketh-playground
blockedBy: [download-project-zip]
covers: [12]
needsAnswers: true
---

## Answers (maintainer, 2026-11-20)

1. A link REPLACES the reader's saved project, after a confirmation. The confirmation says the link's project will replace their files, chain and records, and offers Download first (the existing Download, so they can keep a copy), then Open or Cancel. Cancel keeps the reader's project and opens nothing from the link. With no saved project of the reader's (a first visit, or one that is still the starting project), the link opens without asking. No second, side-by-side project.
2. A link opens on a FRESH chain with no records, exactly as Reset leaves it (reuse `session.reset()`'s mechanism rather than a second way of clearing the stores), with the link's files in place of the starting project's. The link's contracts never meet another project's deployments.
3. Yes: once the link's files are loaded (or the reader cancels), the fragment's `project` key is removed from the URL with `history.replaceState`, other fragment keys kept, so a reload never loads the link again over the reader's edits.

## What to build

A Share button writes the project files, compressed with `fflate`, into the URL fragment and copies the link; the fragment never reaches a server. The spec caps it at 32 KB of compressed fragment, measured as the encoded fragment string (base64 adds about a third to the compressed bytes): above that, Share says the project is too big for a link and offers Download instead. Opening a link loads its files into the editor and runs no script until the reader presses Deploy (the background compile, which hands the Solidity to solc as data, is allowed) (the spec's security boundary: "nothing runs when a link is opened, only on Deploy"). A malformed or truncated link says so and opens nothing.

## Acceptance criteria

- [ ] Share then opening the link in a fresh context shows the same files, and the block number and transcript show nothing ran (e2e).
- [ ] A project whose encoded fragment exceeds 32 KB gets no link and is offered Download.
- [ ] A corrupted fragment is reported and loads nothing.
- [ ] Encoding and decoding are plain `.ts`, tested in node (round trip, the cap, a corrupted input).
- [ ] Opening a link over a saved project of the reader's asks first: Cancel keeps their files, chain and records and opens nothing; Open (after an offered Download) shows the link's files on `chain at block 0` with no records (e2e).
- [ ] Opening a link with no saved project of the reader's opens it without asking.
- [ ] After a link has loaded (or been cancelled) the URL has no `project` key, and a reload shows the files as the reader left them, not the link's.
- [ ] Tests cover the new behaviour.

## Blocked by

- `download-project-zip`

## Prompt

> Goal: Share. The fragment is read once at start (only `web/src/lib/kit` may touch `$app/*`; reading `location.hash` belongs with the composition in `web/src/lib/index.ts` or a kit module). `index.ts` already reads the fragment as `key=value` pairs (`getHashParamsFromLocation`): the project is one key in that format, such as `#project=...`. The open questions are answered above; build to those answers.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy.
>
> The repository is wighawag/rocketh-playground, the rocketh playground at play.rocketh.dev: a reader edits a hardhat-deploy project (Solidity and rocketh deploy scripts) in the browser, compiles it in the tab and runs the deploy scripts with the published rocketh against an EVM in the tab (webevm). Read, before anything else: `AGENTS.md` (the template's conventions, then the section for this repository), `web/src/lib/playground/README.md` (the four workers, `session.ts` as the page's store, the Contracts view, and the Transactions view once pull request #7 has landed), and the spec this task comes from, `work/specs/tasked/rocketh-playground.md` (its Decisions, Implementation Decisions, security boundary and Testing Decisions bind this work). The rules that bite most often: `.svelte` files render and wire only (logic in plain `.ts`, reactivity crosses as stores, never a `.svelte.ts` file); only `web/src/lib/kit` imports `$app/*`; user code never runs on the page's thread; no dependency is added that the spec's Decisions do not approve without asking; the repository is public (describe a change by what it does for a user); never write an em dash; do not hard-wrap Markdown prose. Bound every shell command with `timeout` and cap its output; never grep recursively through node_modules, build output or .git; before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports, never kill a process you did not start.
>
> Done means `pnpm verify` (from the repository root) is green with the new tests in it, and `web/src/lib/playground/README.md` describes what changed.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your final report. When the task did not specify some behaviour and you had to choose, say what you chose and why.
