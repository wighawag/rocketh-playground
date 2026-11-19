# `$lib/playground`: compile, transpile and run, in four workers

The playground's core: what turns the project's files into a run of its deploy scripts. Plain `.ts`, no Svelte, no `$app/*`; each worker entry is a thin file over a module the node tests drive directly (`test/lib/playground/`).

| Thread | Entry | Logic | In | Out |
| --- | --- | --- | --- | --- |
| TypeScript worker (module) | `typescript/typescript.worker.ts` | `typescript/transpile.ts` | project files | CommonJS per file, run-time imports, syntax diagnostics |
| compiler worker (CLASSIC) | `compiler/compiler.worker.ts` | `compiler/solidity.ts` | project files | solc diagnostics, `generated/artifacts/*.js` |
| EVM worker (module) | `evm/evm.worker.ts` | `evm/evm-host.ts` | node options, an IndexedDB name | webevm's node proxy; `serveOn(port)` |
| runner worker (module) | `runner/runner.worker.ts` | `runner/runner-host.ts`, `runner/run.ts` | a port the EVM worker serves; transpiled modules | log entries, deployment store changes, the outcome |

- **User code runs only in the runner.** It resolves imports through `runner/registry.ts`: relative paths to project files, the packages in `runner/bare-modules.ts` (each a lazy chunk, loaded before a run that imports it), and nothing else, with an error naming the import and the list.
- **The config is the reader's**, with the accounts replaced by the throwaway keys in `runner/test-keys.ts`, the in-tab chain declared and the environment named `playground` (`runner/compose-config.ts`).
- **rocketh's transcript** needs a `named-logs` factory installed before any rocketh module is evaluated: `runner/log-hook.ts`, the runner's first import.
- **The starting project** is `web/project-template/`, the published hardhat-deploy template, unedited (`project/template.ts`, refreshed by `scripts/update-project-template.mjs`). **The compiler** is the soljson pinned in `web/solc.json`, copied into `static/solc/` by `scripts/soljson.mjs`.

Design: `work/specs/proposed/rocketh-playground.md` in the rocketh repository, and the runner spike, `docs/spikes/runner/` on branch `spike/runner`.
