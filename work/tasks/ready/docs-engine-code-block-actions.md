---
title: 'template-svelte-docs: a site can add an action link to a code block from its info string'
slug: docs-engine-code-block-actions
spec: open-in-playground
blockedBy: []
covers: [1, 5, 10]
---

**Repository: github.com/wighawag/template-svelte-docs** (the docs template rocketh-website derives from). Filed here, beside spec `open-in-playground`, because that repository has no `work/` board. Build it there; it reaches rocketh-website through its `stem` remote (offshoot-fanout).

## What to build

A generic hook in the docs engine: a site's `web/docs.config.js` may give a function that is called, at build time, for every fenced code block with its language, its info string (`meta`), its source and the page it is on, and that returns either nothing or an action (`{label, href}`). The engine renders a returned action as a link in the code block's header, beside the Copy button (`docs-engine/markdown/rehype.ts`, `highlightCode`), styled like it and ignored by the search index as Copy is. A function that throws fails the build with the page and the block's line, as a dead link does (`DocsSite.check()`'s way of reporting). With no function configured, nothing changes.

This is generic on purpose: "Run this", "Open in playground", "Open in StackBlitz" are all one shape. rocketh-website's use of it is task `rocketh-website-open-in-playground`.

## Acceptance criteria

- [ ] With the hook configured, a block whose function returns an action renders the link beside Copy; one returning nothing renders as today.
- [ ] A throwing function fails the build naming the page and line.
- [ ] Without the hook, the rendered HTML is byte-identical to before (an existing engine test pins it, or add one).
- [ ] The template's README documents the option; its tests are in `web/test/docs-engine/` and run without Vite, as the AGENTS.md "Test the engine without Vite" rule asks.
- [ ] The template's checks pass (`pnpm check`, `pnpm test`, `pnpm format:check`, `pnpm test:e2e` in `web/`).

## Blocked by

- None. Can start immediately.

## Prompt

> Goal: a code-block action hook in template-svelte-docs (github.com/wighawag/template-svelte-docs, local ~/dev/github/wighawag/template-svelte-docs), for spec `open-in-playground` in wighawag/rocketh-playground (`work/specs/tasked/open-in-playground.md`). Read that repository's `AGENTS.md` first, in particular "The docs engine" (three layers kept apart, content never compiled as Svelte, links keep failing the build when dead, test the engine without Vite) and "For descendants of this template". Work in a worktree under ~/dev/worktrees/template-svelte-docs/<branch>, open one PR there. Done means the template's checks pass with the new tests and the README documents the option.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
