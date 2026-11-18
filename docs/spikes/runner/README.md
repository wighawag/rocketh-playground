# Spike: the runner (transpiled deploy scripts, a module registry, webevm over a port)

Throwaway evidence for "The spike to retire the biggest risk first" in the playground's design (`work/specs/proposed/rocketh-playground.md` in the rocketh repository). Not part of `web/`, not built by `pnpm verify`, not meant to ship. It answers one question: do the `hardhat-deploy init` template's own files, unedited, run in a browser when they are transpiled in the tab and run in a worker that reaches the EVM over a port? They do.

## What it does

One page (`index.html`, `src/main.ts`) and four workers. No user code runs on the page's thread.

1. **TypeScript worker** (`src/typescript.worker.ts`, module): TypeScript 6.0.3, `ts.transpileModule` to CommonJS. It transpiles the template's `deploy/01_deploy_counter.ts`, `rocketh/deploy.ts` and `rocketh/config.ts`, plus the generated `generated/artifacts/*.js`. A syntax error comes back with file, line and column, and the run does not start.
2. **Compiler worker** (`src/compiler.worker.ts`, classic, no imports): soljson 0.8.28, copied into the build by `scripts/fetch-solc.mjs`, which refuses a file whose sha256 differs from the one binaries.soliditylang.org's `list.json` gives for the release. It preloads while the page boots. The page turns its output into `generated/artifacts/Counter.js` and `index.js` (`src/artifacts.ts`), in the layout of hardhat-deploy's "javascript" generator.
3. **EVM worker** (`src/evm.worker.ts`, module): webevm 0.9.1's own worker api, with `createIndexedDBPersistence` built inside the worker from a database name the page sends. The page drives it with `createWorkerNode` and asks it to `serveOn` one end of a `MessageChannel`.
4. **Runner worker** (`src/runner.worker.ts`, module): receives the other end of that channel and makes it its provider with `providerOverPort`, so requests go runner to EVM worker and the page relays nothing. It resolves the transpiled modules through a registry (`src/registry.ts`): relative paths to project files (`./config.js` finds `config.ts`), bare specifiers to modules bundled into the runner, anything else fails naming the specifier, the importing file and the list. It loads `rocketh/config.ts`, replaces its accounts with test keys through `privateKey`, declares the in-tab chain and names the environment `playground` (`src/compose-config.ts`), and runs the scripts with `@rocketh/web`'s `setupEnvironment(...).loadAndExecuteDeploymentsFromModules` with `autoMine: false` and a `createIndexedDBDeploymentStore`. Log entries and every store change are posted to the page.

Stop terminates the runner, closes the port the EVM worker served it, and starts a new runner on a new port. The chain is in the EVM worker and is not touched.

The template's files come from the published `hardhat-deploy@2.4.0` tarball (`scripts/fetch-template.mjs` checks its npm integrity, then extracts `templates/basic/`), not from a checkout, and are not edited. Every rocketh package is a published version, pinned in `package.json`.

```bash
pnpm install          # its own pnpm root, outside the web/ workspace
pnpm build            # fetches the template and soljson, then vite build
node measure.mjs > measured.json   # starts vite preview, drives Chromium, stops the server
```

`measured.json` is the output of the run the tables below come from.

## Measured

Headless Chromium 151.0.7922.34 (Playwright 1.62.1), Linux x86_64, 32 cores, `vite preview` on localhost, so the network costs almost nothing here and the times are the CPU's. Three runs gave the same checks and times within about 30%; the numbers are from `measured.json`.

### Bundles

| Bundle | Raw | gzip |
| --- | --- | --- |
| page (`index-*.js`: webevm client, comlink, the page) | 93.9 KB | 32.7 KB |
| TypeScript worker (all of `typescript`) | 3.54 MB | 988 KB |
| compiler worker (the loader only) | 0.5 KB | 0.3 KB |
| soljson 0.8.28 (`soljson-v0.8.28+commit.7893614a.js`) | 9.17 MB | 6.52 MB |
| EVM worker (webevm, ethereumjs engine) | 485 KB | 142 KB |
| runner worker (rocketh, the `@rocketh/*` extensions, viem, the registry) | 2.57 MB | 477 KB |
| viem's WebSocket shim (lazy chunk, never fetched here) | 0.3 KB | 0.2 KB |

A first visit downloads about 8.2 MB gzipped, 80% of it the compiler: at 20 Mbit/s that is about 3.3 s, at 5 Mbit/s about 13 s (arithmetic from the gzip column, not measured; the throttling attempt below failed).

What is in the runner, measured by removing one thing and rebuilding:

| Removed from the runner | Runner raw | Runner gzip | Saved (gzip) |
| --- | --- | --- | --- |
| nothing | 2.57 MB | 477 KB | |
| `@rocketh/proxy` and `@rocketh/diamond` (the v1 proxy and diamond artifacts they ship) | 1.58 MB | 338 KB | 139 KB |
| `viem` as a whole namespace (rocketh still pulls what it uses) | 2.51 MB | 462 KB | 15 KB |
| `@rocketh/playground` (only `captureConsole` and `createLogStream` are used) | 2.54 MB | 471 KB | 6 KB |

### Times

| What | Time |
| --- | --- |
| cold page ready: TS worker, chain, runner (wall clock from `goto`) | 592 ms |
| cold compiler loaded (fetch + instantiate soljson, in the background) | 447 ms |
| cold Deploy to `deployments/playground/Counter.json`, compiler already loaded | 124 ms (compile 74, transpile 30, run 18) |
| cold Deploy clicked the moment the page is ready (waits 119 ms for the compiler) | 240 ms |
| warm Deploy to the record (HTTP cache warm, fresh chain and store) | 118 ms |
| second Deploy, nothing changed: sends nothing | 26 ms total (run 2 ms) |
| Deploy after editing `Counter.sol`: redeploys, one transaction | 27 ms to the record |
| reload: page ready with chain and records restored | 434 ms |
| first Deploy after that reload: sends nothing | 111 ms |
| Stop during an infinite loop (terminate, close the port, new runner ready) | 159 ms |
| Deploy after Stop: sends nothing, chain intact | 30 ms |

The first Deploy on any page load costs about 100 ms more than the next ones: solc's first compile and TypeScript's first `transpileModule` are slow while their code warms up. After that a whole compile, transpile and run is under 30 ms.

### What the checks found

- **The template's files ran unedited.** `01_deploy_counter.ts` deployed `Counter` and rocketh saved `deployments/playground/Counter.json` and `.chain`. The transcript is rocketh's own: `- Executing 01_deploy_counter.ts`, `- Deploying Counter with tx: 0x...`, `=> 0x5fbd...`.
- **A second Deploy sent nothing.** No `eth_sendRawTransaction`, the block number did not move, and the transcript says `reusing "Counter" at 0x5fbd...`. It still makes five read requests (`eth_chainId` twice, `eth_getBlockByNumber`, `eth_accounts`, `eth_feeHistory`).
- **Editing the contract redeployed it** at a new address, with one transaction.
- **A reload restored the chain and the records**: the block number (2) was the same, the record's address had code (975 bytes), and Deploy then sent nothing, which needs the `.chain` file's genesis hash to match the restored chain's.
- **Stop ended `while (true) {}`** in a second script (`deploy/02_loop.ts`) after `01` had run. The block number and the contract's code were the same after it, and the next Deploy ran and sent nothing.
- **Failures are named and send nothing**: an import of `viem/utils` fails with `deploy/02_bad.ts imports "viem/utils", which the playground cannot provide. It resolves relative imports to project files, and these packages: rocketh, ...`; a syntax error stops at the transpile with `deploy/02_bad.ts:3:12 Expression expected.`; a script writing `document.title` fails with `ReferenceError: document is not defined`; a script that throws reports its message.

## What broke, or nearly did

- **The template's own `rocketh/config.ts` spreads `@rocketh/unknown-signer`**, which the spec's list of bare specifiers leaves out. With the spec's list the unedited template fails on its first import. The runner adds it; the list in v1 needs it.
- **rocketh's transcript is silent unless a `named-logs` factory is hooked BEFORE rocketh's modules are evaluated.** rocketh (`src/internal/logging.ts`) and `@rocketh/deploy` (`src/index.ts`) call `logs(name)` at module scope, and `named-logs` hands back a no-op logger when no factory exists at that moment. `captureConsole`, which the spec names for the log stream, only sees `console.*` calls, which is what a script prints, not what rocketh prints: without the hook the transcript has none of rocketh's progress lines and no `reusing "Counter"`, so "Deploy again sends nothing and the transcript says so" cannot be met. The runner's first import (`src/log-hook.ts`) sets `globalThis._logFactory`, which `named-logs` reads in both versions installed (0.3.2 and 0.4.1). rocketh also logs a bare newline after each script, which shows as an empty line.
- **`import * as x` turned into `__importStar` adds a `default` key**, and spreading it into `extensions` would give rocketh an entry called `default` that is not a function, which `withEnvironment` refuses. The registry marks each bundled namespace with a non-enumerable `__esModule`, so it passes through unchanged and a spread copies only the real exports.
- **`list.json` lists nightlies under the release's version.** `builds.find(b => b.version === '0.8.28')` returns `0.8.28-nightly.2024.9.4`, a different file with a different sha256. The release is `releases['0.8.28']`, and `scripts/fetch-solc.mjs` looks it up that way.
- **`createWorkerNode` cannot take the persistence adapter** (it is cloned into the worker), so the EVM worker cannot be webevm's one-line `worker-entry`: it is a module of our own that builds the adapter from a database name, as template-commit-reveal's `offline-node-host.ts` does.
- **The runner is big because a bundled namespace cannot be tree-shaken.** The registry must hand a script whatever it imports, so each listed package is bundled whole: `@rocketh/proxy` and `@rocketh/diamond` alone are 139 KB gzip, for the v1 proxy and diamond artifacts they ship. A registry that loads a package only when a script imports it (scan the transpiled `require` calls, `import()` those packages, then evaluate) would take the runner to about 340 KB gzip for the starting project.
- **Throttling did not throttle the workers.** A first attempt to measure a slow connection with `Network.emulateNetworkConditions` on the page's CDP session finished faster than its own bytes allow: requests made by workers (soljson's `importScripts`, the worker bundles) were not slowed. It was removed rather than reported; a slow-network number needs throttling at the server or a per-target CDP session.
- **Install noise, not bundle weight:** `@rocketh/web` 0.19.33 declares `tsx` as a runtime dependency, which installs esbuild and `@parcel/watcher` for a browser package; `@rocketh/playground` 0.1.7 depends on `webevm ^0.5.0`, so a second webevm is installed (not bundled here), and its root entry, which has no `sideEffects: false`, puts its GreetingsRegistry fixtures in the runner (6 KB gzip). These are rocketh's packaging, not the playground's.
- **Not covered here:** the Cache API for the compiler (the HTTP cache did the warm visit), the editor and its language service, a revert, `deployViaProxy` and `execute`, Reset, Share and export. `@rocketh/diamond` is bundled and loads in a worker but no script called it. `@rocketh/unknown-signer` is exercised only as far as `withEnvironment` calling its entries with the environment before each script.
