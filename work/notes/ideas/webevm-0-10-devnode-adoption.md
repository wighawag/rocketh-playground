---
title: 'What webevm 0.10.0 and @webevm/devnode 0.1.0 could change here: dev accounts, worker-side signing, reset to after deploy'
slug: webevm-0-10-devnode-adoption
type: idea
status: incubating
created: 2026-11-20
---

# webevm 0.10.0 and @webevm/devnode

Captured 2026-11-20 from a note from the webevm side. Nothing here is built, and nothing should be until webevm's release PR (#27, "Version Packages") is merged and publishes webevm 0.10.0 and @webevm/devnode 0.1.0. Until then `web/package.json` stays pinned at `"webevm": "0.9.1"`. Each item below is the maintainer's decision; the second and third are design changes, and the first adds a dependency.

## What 0.10.0 brings (as reported, to check against the published packages)

- `evm_mine`, `anvil_mine` and `hardhat_mine` are answered.
- `hardhat_setBalance` / `setNonce` / `setCode` / `setStorageAt` and their `anvil_` names.
- `evm_snapshot` / `evm_revert` (and `anvil_` names), rolling back state, blocks, receipts, logs, the stateHistory window and pending transactions.
- `webevm/worker-host`'s `createNodeWorkerApi` / `exposeNode` take an optional `createNode` factory.
- @webevm/devnode 0.1.0: a SlimNode decorator answering `eth_accounts`, `eth_sendTransaction`, `eth_signTransaction`, `personal_sign`, `eth_sign`, `eth_signTypedData_v4`; funds accounts at genesis; opt-in `hardhat_`/`anvil_` impersonation over a `senderMode: 'trusted'` node; `toAllocs(dump)` for a forge `vm.loadAllocs` file; runs on the main thread, over a worker proxy, or in a worker (`@webevm/devnode/worker-host`). Default accounts are anvil's: the first five keys match `TEST_KEYS` (`web/src/lib/playground/runner/test-keys.ts:7`) and the default 10,000 ETH equals `INITIAL_BALANCE` (`test-keys.ts:24`).

## Mandatory on any bump to 0.10.0

Two comments become wrong: `web/src/lib/playground/runner/run.ts:135` and `web/src/lib/playground/contracts/chain-calls.ts:19` say webevm answers `evm_mine` with -32601. `autoMine: false` stays correct, but the reason becomes "the node already auto-mines", not "the method is missing".

## Option 1: dev accounts, so the reader's named accounts resolve as written

`composeConfig` (`web/src/lib/playground/runner/compose-config.ts:34`) replaces the reader's accounts with `privateKey` test keys only because webevm has no `eth_accounts`. With devnode, `deployer: 0, admin: 1` would resolve as on anvil or Hardhat, so the playground's config would be closer to the exported project's. Cost: a new dependency (@webevm/devnode), and the swap logic and its tests change.

## Option 2: signing in the EVM worker

`web/src/lib/playground/evm/evm-host.ts:26` calls `createNodeWorkerApi()`. It could pass `createNode: (o) => createDevNode({...o, accounts: 5})`, keeping the worker's IndexedDB persistence. Do not use `exposeDevNode`: it has no hook for the persistence adapter this worker builds. Caveats: genesis funding applies only to a new chain, so a chain restored from IndexedDB keeps its own balances. And `chain-calls.ts` signs on the page by design, so moving keys into the worker reverses a recorded choice; that needs its reason revisited, not just the code changed.

## Option 3: "reset to after deploy"

Take an `evm_snapshot` after the deploy scripts finish, and offer a reset that `evm_revert`s to it, instead of re-running the scripts. Open: how a snapshot id survives a reload with the persisted chain (it may not, in which case reset falls back to a re-run), and how it interacts with the runner's deployments store, which must roll back with the chain.
