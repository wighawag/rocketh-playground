---
title: 'rocketh-website: "Open in playground" on every sample marked with an example file'
slug: rocketh-website-open-in-playground
spec: open-in-playground
blockedBy: [project-link-overlay-encoding, docs-engine-code-block-actions]
covers: [1, 2, 4, 5, 10, 11]
---

**Repository: github.com/wighawag/rocketh-website** (the site of rocketh.dev). Filed here, beside spec `open-in-playground`, because that repository has no `work/` board. Build it there.

Also blocked, in another repository, by rocketh's task `playground-examples-check` (it creates `examples/playground/` and the first marked sample).

## What to build

rocketh-website uses the engine's code-block action hook (task `docs-engine-code-block-actions`, arrived through `stem`) to give every fence whose info string carries `playground=<example>/<path>` an "Open in playground" link to `https://play.rocketh.dev/#project=2.<...>`. At build time it reads every file of `examples/playground/<example>/` from the rocketh checkout (`ROCKETH_DIR`, as the content is), and encodes them with `select: <path>` in the playground's `2.` encoding. The encoder is a copy of the playground's (task `project-link-overlay-encoding`), held to its shared test vector: copy the vector file into this repository's tests, and fail a test if the copy's output differs from it.

The build fails, naming the page and line, when the example folder or the named file does not exist, or when the link would exceed the playground's 32 KB fragment cap. A fence without `playground=` renders as today. Add `fflate` to `web/package.json` (approved with the spec's answers, 2026-11-20). The site-specific code goes where README.md, "What is specific to this site", says such code goes (`web/docs.config.js` and a module it imports), not into the engine.

## Acceptance criteria

- [ ] A marked fence renders the link; its fragment decodes, with the playground's decoder logic as copied, to exactly the example's files and the named `select`.
- [ ] The encoder test reproduces the shared vector exactly.
- [ ] A missing example, a missing file, or an over-cap link fails the build with page and line.
- [ ] `web/e2e/tests/rocketh.e2e.ts` checks that a marked sample on its page shows the link (against a rocketh checkout that has one).
- [ ] README.md's "What is specific to this site" lists the handler.
- [ ] `pnpm check`, `pnpm test`, `pnpm format:check` and `pnpm test:e2e` in `web/` pass with `ROCKETH_DIR` on a rocketh checkout that has the first example.
- [ ] The report says which rocketh-website commit to pin: the change reaches rocketh.dev only through a rocketh PR that moves `ROCKETH_WEBSITE_REF` in `.github/workflows/deploy.yml`, naming what it was verified against.

## Blocked by

- `project-link-overlay-encoding` (this repository)
- `docs-engine-code-block-actions` (template-svelte-docs, built from this board)
- rocketh `playground-examples-check` (rocketh's board)

## Prompt

> Goal: the "Open in playground" link on rocketh.dev, for spec `open-in-playground` in wighawag/rocketh-playground (`work/specs/tasked/open-in-playground.md`). Work in github.com/wighawag/rocketh-website (local ~/dev/github/wighawag/rocketh-website), in a worktree under ~/dev/worktrees/rocketh-website/<branch>. Read its `AGENTS.md` and `README.md` first: content changes go to rocketh, site-specific code stays here, anything generic goes to template-svelte-docs first; checks need a built rocketh checkout (`pnpm i && pnpm docs:widgets` in rocketh, then `ROCKETH_DIR`). The encoder and the shared test vector are in rocketh-playground (`web/src/lib/playground/project/` and its tests). Open one PR there; do not move rocketh's pin yourself.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
