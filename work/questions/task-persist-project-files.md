<!-- dorfl-sidecar: item=task:persist-project-files type=task slug=persist-project-files allAnswered=false -->

## Q1

**'task:persist-project-files' was bounced — how should we proceed?**

> acceptance gate failed (exit 1) on the rebased tip — the failing step was: `pnpm verify`; its last output was:
>
>      24|   const preset: Record<string, unknown> = {};
>      25|   preset.onRuntimeInitialized = () => resolve(preset as unknown as Sol…
>      26|   new Function('Module', 'require', '__filename', '__dirname', source)…
>        |   ^
>      27|   if (preset.calledRun) resolve(preset as unknown as Soljson);
>      28|  });
>  ❯ loadSoljson test/lib/playground/helpers.ts:23:9
>  ❯ prepare test/lib/playground/helpers.ts:46:34
>  ❯ Object.run test/lib/playground/workers.test.ts:80:25
>  ❯ test/lib/playground/workers.test.ts:95:19
> ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
>  Test Files  1 failed | 19 passed (20)
>       Tests  3 failed | 174 passed | 1 skipped (178)
>    Start at  13:00:33
>    Duration  8.31s (transform 1.64s, setup 0ms, import 4.44s, tests 23.03s, environment 5ms)
> /tmp/dorfl-fresh-gate-LYLXRy/tip/web:
>  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  rocketh-playground-web@0.0.1 test: `vitest run`
> Exit status 1
>  ELIFECYCLE  Command failed with exit code 1.
>  ELIFECYCLE  Command failed with exit code 1.

<!-- q1 fields: id=q1 kind=stuck -->

**Your answer** (write below this line):
Retry, continuing from the kept branch. The gate failed in the fresh worktree on a pre-existing race, not on this task's code: in a clean tree `web/static/solc/` has no soljson, so several vitest workers call `ensureSoljson` (`web/scripts/soljson.mjs`) at once, each fetches and rewrites the file with `writeFileSync`, and one worker's `loadSoljson` reads it while another is rewriting it (the SyntaxError in `test/lib/playground/helpers.ts`, seen from `workers.test.ts`). Keep the persist work as it is and also fix the race: make `ensureSoljson` write atomically (write to a unique temporary file in `static/solc/`, then `renameSync` it over the final path), with a comment saying why. Record it in the Decisions block. Check that `pnpm verify` passes from a tree with no `web/static/solc/`.
