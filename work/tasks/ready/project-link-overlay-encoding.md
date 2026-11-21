---
title: 'A link that opens the starting project with some files over it, and one of them selected'
slug: project-link-overlay-encoding
spec: open-in-playground
blockedBy: []
covers: [2, 3, 4, 11, 12]
---

## What to build

A second encoding of the fragment's `project` key, `2.`, that "Open in playground" buttons on rocketh.dev will produce. Where `1.` holds a whole project, `2.` holds only the files that differ from the starting project (`web/project-template/`) and the path of the file to select. Opening a `2.` link goes through the existing shared-link path (`project/open-link.ts`, `session.open()`, the confirmation over a saved project, the `project` key removed from the URL afterwards): the starting project's files with the link's files over them, on a fresh chain, nothing run until Deploy, and the named file selected in the editor.

The payload is JSON, deflated with fflate, in base64url without padding, as `1.` is. Its shape is `{"files": {<path>: <text>}, "select": <path>}`, `select` optional and required to be one of the resulting project's files. JSON keys are written in sorted order so the same input always gives the same link, which is what lets rocketh-website hold a copy of the encoder to one test vector. The same path rules as `1.` apply to the files (relative, no `..`, nothing under `deployments/`), and the same 32 KB fragment cap.

Commit the shared test vector as a plain JSON file in the web tests (a fixed set of files, a `select`, and the exact `project` value the encoder must produce), with a short README line saying rocketh-website keeps a copy of the encoder held to this file, so a change to the encoding must change the vector and both repositories together. Keep the encoder a plain function with no dependency beyond fflate, so it can be copied as it is.

## Acceptance criteria

- [ ] `encodeOverlay(files, select?)` and its decoder are plain `.ts`, tested in node: round trip, the vector reproduced exactly, the cap, a corrupted value, a path the rules refuse, a `select` that names no file.
- [ ] Opening a `2.` link shows the starting project with the link's files over it, the named file selected, `chain at block 0`, and nothing run (e2e).
- [ ] A `1.` link still opens as before (e2e unchanged).
- [ ] `web/src/lib/playground/README.md` describes the `2.` encoding and the shared test vector.
- [ ] `pnpm verify` is green.

## Blocked by

- None. Can start immediately.

## Prompt

> Goal: the `2.` link encoding of spec `open-in-playground` (`work/specs/tasked/open-in-playground.md`, "Implementation Decisions"). Read the spec, `AGENTS.md`, and `web/src/lib/playground/README.md` (its "Share" and "Opening a link" bullets), then `project/share-link.ts`, `project/open-link.ts` and their tests (`test/lib/playground/share.test.ts`). Extend; do not fork a second opening path. Done means `pnpm verify` (repository root) is green with the new tests, and the README describes the change.
>
> FIRST, check this task against current reality (it is a launch snapshot and may have DRIFTED): does it still match the code, `work/tasks/done/`, the relevant ADRs, and the tasks it depends on? If a dependency landed differently than this task assumes, do NOT build on the stale premise: stop and report the discrepancy (WORK-CONTRACT "Drift is a needs-attention signal").
>
> The repositories are public: no file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose. Bound every shell command with `timeout`, stop any server you start, and never send a transaction.
>
> RECORD non-obvious in-scope decisions you make while building in a `## Decisions` block at the end of your FINAL REPORT. When the task did not specify some behaviour and you had to choose, say what you chose and why. Do not write the done record, the commit message or the PR body yourself.
