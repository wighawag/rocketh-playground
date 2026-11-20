<!-- dorfl-sidecar: item=task:share-link type=task slug=share-link allAnswered=false -->

## Q1

**'task:share-link' was bounced — how should we proceed?**

> acceptance gate failed (exit 1) on the rebased tip — the failing step was: `pnpm verify`; its last output was:
>
>   ✔ done
> [33m[PLUGIN_TIMINGS] [0mYour build spent 100% of 6.4s inside plugin hooks (6.4s).
> Measured inside the callback, so queue time is excluded and time the callback itself awaited is not:
>   - vite-plugin-sveltekit-compile writeBundle (68%, 4.3s, 1 call)
> Those rows are 68% of the build; the rest of the 100% is below.
> Not measurable — 3 hooks whose calls overlap, so elapsed time covers work other calls were doing. Profile with `node --cpu-prof`:
>   - vite-plugin-sveltekit-guard resolveId (3886 calls)
>   - vite:asset load (13 calls)
>   - vite-plugin-svelte:preprocess transform (295 calls)
> See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details.
> > rocketh-playground@0.0.0 web:e2e /tmp/dorfl-fresh-gate-xq4TIN/tip
> > pnpm --filter ./web e2e
> > rocketh-playground-web@0.0.1 e2e /tmp/dorfl-fresh-gate-xq4TIN/tip/web
> > playwright test
> Error: http://localhost:4273 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.
> /tmp/dorfl-fresh-gate-xq4TIN/tip/web:
>  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  rocketh-playground-web@0.0.1 e2e: `playwright test`
> Exit status 1
>  ELIFECYCLE  Command failed with exit code 1.
>  ELIFECYCLE  Command failed with exit code 1.

<!-- q1 fields: id=q1 kind=stuck -->

**Your answer** (write below this line):
Retry, continuing from the kept branch. The gate failed only because another process held port 4273 when the e2e step started (the check and the unit tests passed); the port is free again. The conductor rebases the kept branch onto main by hand, then re-dispatches. Before Playwright, check ports 4273 and 4274 are free (`ss -ltnp`) and if not set `E2E_GATEWAY_PLAIN_PORT`/`E2E_GATEWAY_SW_PORT` to free ports.
