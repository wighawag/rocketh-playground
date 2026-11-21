---
title: 'rocketh-website: every "Open in playground" link opens its example without the starting project''s Counter'
slug: rocketh-website-bare-base
spec: bare-starting-project
blockedBy: [project-link-bare-base]
covers: [1, 2, 7]
---

**Repository: github.com/wighawag/rocketh-website** (the site of rocketh.dev). Filed here, beside spec `bare-starting-project`, because that repository has no `work/` board. Build it there.

## What to build

rocketh-website's "Open in playground" handler (`web/open-in-playground/code-block-action.js`, from task `rocketh-website-open-in-playground`) writes `base: "bare"` on every link, so an example opens on play.rocketh.dev without the starting project's `contracts/Counter.sol` and `deploy/01_deploy_counter.ts`. There is no per-example choice.

Port the playground's change (task `project-link-bare-base`) by hand, since this repository holds a port, not a byte copy:

- `web/open-in-playground/overlay-link.js` gains `encodeOverlay(files, select?, options?: {base?: 'bare'})`, writing `base` only when it is `'bare'`, as the playground's `web/src/lib/playground/project/overlay-link.ts` does.
- The test copy of the decoder, `web/test/open-in-playground/decode-overlay.ts`, accepts `base` absent or `"bare"` and refuses any other value, as the playground's `decodeOverlay` does.
- Copy both of the playground's vectors as they are after `project-link-bare-base` into `web/test/open-in-playground/`: the new `web/test/lib/playground/overlay-link-bare-vector.json`, and the existing `overlay-link-vector.json` again (its `about` text may have changed; its `value` has not). Hold the encoder to both.
- Update the header of `overlay-link.js` and README.md's "What is specific to this site" row for `web/open-in-playground/` to say links open the example without the Counter sample.

## Acceptance criteria

- [ ] The encoder reproduces both shared vectors exactly (the existing one's value unchanged, the bare one new), and the vector copies are byte-identical to the playground's.
- [ ] A marked fence's link decodes, with the test decoder, to exactly the example's files, the named `select` and `base: "bare"` (unit test and `web/e2e/tests/rocketh.e2e.ts`).
- [ ] The test decoder refuses an unknown `base` value.
- [ ] `pnpm check`, `pnpm test`, `pnpm format:check` and `pnpm test:e2e` in `web/` pass with `ROCKETH_DIR` on a built rocketh checkout at main, and `node scripts/check-omissions.mjs stem/main` still passes.
- [ ] The report names the rocketh-website commit to pin. Do not move rocketh's pin: rocketh task `playground-examples-bare-base` moves it together with the content that describes the change.

## Blocked by

- `project-link-bare-base` (this repository): play.rocketh.dev must read `base` before any link carries it, and the bare vector comes from it.

## Prompt

> Goal: make rocketh.dev's "Open in playground" links ask for the bare base, for spec `bare-starting-project` in wighawag/rocketh-playground (`work/specs/tasked/bare-starting-project.md`). Work in github.com/wighawag/rocketh-website (local ~/dev/github/wighawag/rocketh-website), in a worktree under ~/dev/worktrees/rocketh-website/<branch>. Read its `AGENTS.md` and `README.md` first, then `web/open-in-playground/` and `web/test/open-in-playground/`, and in rocketh-playground the merged `project-link-bare-base` (its done record, `web/src/lib/playground/project/overlay-link.ts`, `share-link.ts` and the two vectors). Checks need a built rocketh checkout (`pnpm i --frozen-lockfile && NX_SKIP_NX_CACHE=true pnpm docs:widgets` in rocketh, then `ROCKETH_DIR`). Open one PR there; do not move rocketh's pin.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
