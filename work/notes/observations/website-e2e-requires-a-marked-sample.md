---
title: "rocketh-website's e2e fails, rather than skips, against a rocketh checkout with no marked sample"
type: observation
status: spotted
spotted: 2026-11-21
---

rocketh-website PR #9 added "opens a marked sample in the playground" to `web/e2e/tests/rocketh.e2e.ts`. It looks for the first fence marked `playground=` in the checkout's pages and asserts one exists, like the existing `::: danger` test does for containers. rocketh has had marked samples on main since its PR #291, so this only bites when building the site against an older rocketh ref (a `workflow_dispatch` of rocketh-website's `verify` with an old `rocketh-ref`, or bisecting). Benign today; worth knowing before reading such a failure as a regression.
