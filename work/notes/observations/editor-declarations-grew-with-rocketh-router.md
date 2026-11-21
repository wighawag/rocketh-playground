---
title: "The editor's declarations asset grew about 23% when @rocketh/router was added"
type: observation
status: spotted
spotted: 2026-11-21
---

Task `runner-resolves-rocketh-router` raised the `declarations` budget in `web/scripts/bundle-budgets.mjs` from 11,906,743 B raw / 1,169,639 B gzip to 14,658,446 / 1,408,184. `@rocketh/router`'s types import solidity-proxy's artifact index, which brings every one of its artifacts in as a literal type. The asset is fetched when the editor's type checking starts, not on the first load, so a reader pays for it in the time before the first diagnostics, whether or not their project imports the router.

Trimming those artifact types in `scripts/declarations.mjs` (or loading a package's declarations only once a file imports it) could be a task of its own if first-type-check time matters. The catch the builder named: the editor's types would then differ from the published package's.
