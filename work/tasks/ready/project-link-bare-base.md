---
title: 'A link can open an example without the starting project''s Counter, and Download writes only what the tab held'
slug: project-link-bare-base
spec: bare-starting-project
blockedBy: []
covers: [1, 2, 3, 4, 5, 7]
---

## What to build

The playground half of spec `bare-starting-project`. A `2.` link may carry `"base": "bare"`: it then opens the starting project without its Counter sample (`contracts/Counter.sol` and `deploy/01_deploy_counter.ts`), so the reader sees the link's files plus `rocketh/config.ts` and `rocketh/deploy.ts` (or the link's own), and Deploy runs only the link's scripts. Without the key a `2.` link opens exactly as today, and so does a `1.` link. play.rocketh.dev opened on its own, and Reset, still give the full starting project.

1. **The bare base.** `bareProject()` in `project/template.ts`, beside `STARTING_PROJECT_PATHS`: the starting project without those two files. It throws when either path is missing from the template, as `startingProject()` does, and a unit test calls it, so a template update that renames or removes either file fails `pnpm verify` (and the release follower's pull request). Its comment names the copy of the list in rocketh's `scripts/test-playground-examples.sh` (rocketh task `playground-examples-bare-base`), so a change is made in both.
2. **The encoding.** `encodeOverlay(files, select?, options?: {base?: 'bare'})` in `project/overlay-link.ts` writes `base` only when it is `'bare'`, so the existing vector `web/test/lib/playground/overlay-link-vector.json` keeps its `files`, `select` and `value` (its `about` text may be reworded, item 6). Add `web/test/lib/playground/overlay-link-bare-vector.json`: the same files and `select` as the existing vector, `base: "bare"`, and the exact value. The decoder accepts `base` absent or `"bare"` and refuses any other value, and still refuses any other unknown key: a `base` that is a string other than `"bare"` is a newer link (item 4), a `base` of any other type is corrupted. `encodeOverlay` throws on a `base` other than `undefined` or `'bare'` (rocketh-website's port is plain JavaScript, with no type check). A bare link with an empty `files` is accepted; what Deploy then does on a project with no contract (solc may refuse empty sources) is yours to find out and record as a Decision, not to fix.
3. **Opening.** `decodeLink(value, bases: {starting: ProjectFiles; bare: ProjectFiles})`, since which base applies is known only once the payload is read. `createLinkOpener` keeps `starting` for what counts as no project of the reader's own, and gains `bare` (default `bareProject()`); today `starting` means both that and "what a `2.` link's files go over", and the two must come apart. A bare link opens at once on a first visit, asks first over a reader's own project, and goes through `session.open()` as every link does.
4. **A link from a newer playground.** When a `2.` link is refused only for an unknown key or an unknown `base` value, the error says the link needs a newer version of the playground and to reload, and the `project` key stays in the URL, as it does when the playground fails to start (`open-link.ts`). Every other refusal removes the key as today. This lets a returning visitor whose service worker first serves a cached older build get the link on the next load.
5. **Download.** `exportedProject` (`project/export-project.ts`) leaves out every `STARTING_PROJECT_PATHS` file the project does not hold, instead of restoring it from the template, and leaves out the template's Counter tests (`COUNTER_TESTS`) when `contracts/Counter.sol` is changed (as today) or when either Counter file is absent (`test/Counter.ts` expects a `Counter` deployment). The README preamble says which template files were left out and why. A project holding those files downloads byte for byte as before.
6. **Documentation.** `web/src/lib/playground/README.md`: the `2.` bullet (the `base` key, the keys a payload may hold, what an empty `files` opens, the second vector), the Opening a link bullet (which base a `2.` link opens over; a link refused for an unknown key or `base` keeps its key and asks for a reload), the export-installs bullet (the bare case) and the Download bullet. The vectors' `about` text. The `share-link.ts` and `overlay-link.ts` headers, including correcting `overlay-link.ts`'s claim that rocketh-website keeps "a copy of THIS FILE, as it is": it keeps a hand port with JSDoc types (`web/open-in-playground/overlay-link.js`) and a copy of the decoder in its tests, both held to the vectors.

## Acceptance criteria

- [ ] `encodeOverlay` with and without `base` is tested in node: round trip, both vectors reproduced exactly, an unknown `base` value refused, a bare link with empty `files` accepted. `bareProject()` is tested against the template.
- [ ] Opening the bare vector's link shows only its files plus `rocketh/config.ts` and `rocketh/deploy.ts`, the named file selected, `chain at block 0`, nothing run (e2e). The existing `1.` and `2.` e2e tests pass unchanged.
- [ ] A link refused for an unknown key keeps the `project` key in the URL and says to reload; a corrupted link still removes it (tests).
- [ ] Download of a project without `contracts/Counter.sol` and `deploy/01_deploy_counter.ts` leaves them and the Counter tests out and says so in the README; the starting project's export is byte-identical to before (tests); `pnpm test:export` installs and deploys such a project: extend the export test with `bareProject()` with the bare vector's files over it (Greeter), asserting the Counter files and `COUNTER_TESTS` are absent and that `pnpm hardhat deploy` deploys `Greeter` and not `Counter`.
- [ ] The README (the `2.`, Opening a link, export-installs and Download bullets), the vectors' `about` text and the two headers describe the change.
- [ ] `pnpm verify` and `pnpm test:export` are green.

## Blocked by

- None. Can start immediately.

## Prompt

> Goal: the bare base for `2.` links and a Download that writes only what the tab held, for spec `bare-starting-project` (`work/specs/tasked/bare-starting-project.md`). Read the spec, `AGENTS.md`, `web/src/lib/playground/README.md` (the Share, `2.` link, Opening a link and Download bullets), then `project/template.ts`, `project/overlay-link.ts`, `project/share-link.ts`, `project/open-link.ts`, `project/export-project.ts` and their tests (`test/lib/playground/overlay-link.test.ts`, `share.test.ts`, `export-project.test.ts`, `test/export/installs-and-deploys.export.ts`, and `e2e/tests/playground.e2e.ts`). Extend the existing opening path; do not add a second one. Done means `pnpm verify` and `pnpm test:export` are green with the new tests, and the README describes the change.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
