# setup

`pnpm i`

# frontend

in ./web
for typescript checks: `pnpm check`
for tests: `pnpm test`

## Svelte conventions

- **`.svelte` files must be logic-less or logic-minimal.** They should only render UI and wire props/stores together. Small presentational conveniences are fine (a display formatter, a class toggle, a UI-only animation, local open/closed modal state). Anything else, business/domain logic, async calls, data fetching/derivation, non-trivial computation, filtering/sorting/aggregating domain data, network error handling, belongs in a plain `.ts` module (a helper, a store, or a service) that the component imports.

- **Never create `.svelte.ts` files.** Do not use Svelte runes (`$state`, `$derived`, `$effect`, ...) outside of `.svelte` components. Put reusable logic in plain `.ts` files and expose reactivity with Svelte stores (`writable`/`readable`/`derived` from `svelte/store`). Components consume those stores with the `$store` syntax and own any `$effect`/lifecycle wiring themselves.

- Logic lives in `.ts`, reactivity crosses the boundary as stores. Prefer factory functions that return `{subscribe, ...actions}`.

The second of these is checked by `web/test/svelte-conventions-boundary.test.ts`, along with the `.svelte.ts` ban. The first is deliberately left to review: it is about the KIND of code, not its size, and every mechanical proxy for it fires on the wrong things.

## The framework boundary

- **Only `web/src/lib/kit` may import `$app/*`.** Everything under `web/src/lib/core` takes what it needs from the framework as a parameter (`PathResolver`, `ServiceWorkerEnvironment`), and `web/src/routes/**` is exempt because routes are the framework's own surface. `web/test/framework-boundary.test.ts` enforces this, and `web/src/lib/kit/README.md` explains the scope, including what the rule deliberately does not cover.

- **`web/src/lib/index.ts` is where the app is composed**, which is why it is allowed to import both `./kit/*` and the framework. Anything that composes THIS app belongs there rather than in `core/`.

## For descendants of this template

This repo is the root of a template tree; other repos derive from it through a `stem` git remote and inherit `web/src/lib/core` wholesale, in several cases byte-identical. A change that is meaningful for a sibling belongs HERE rather than in the descendant that discovered it, or every sibling silently misses it. The two boundary tests above are stated at this level for the same reason: a rule inherited by every descendant is worth more than the same rule re-derived in each of them.

# rocketh playground (this repository)

This repository is the rocketh playground, made from `template-svelte-shadcn` (the `stem` remote). Its design is the spec `work/specs/proposed/rocketh-playground.md` in this repository; read it before changing anything here, and check it against the rocketh, webevm and template-commit-reveal code it cites rather than trusting it.

- **Generic changes go to the template first.** A fix or feature that is not specific to the playground is a pull request on `template-svelte-shadcn` (or higher), then comes down through `stem`. Deleting a template file is recorded in `.offshoot-omissions` with its reason.
- **It runs PUBLISHED rocketh packages**, pinned in `package.json`, never a rocketh checkout: the project a reader exports pins published versions, and the playground must run the same ones.
- **User code never runs on the page's thread.** Deploy scripts run in a worker; the page renders. See the spec's security boundary.
- **The project a reader exports is MIT** (it comes from the `hardhat-deploy init` template); only this repository's own code is AGPL-3.0.
- **This repository is public.** No file, pull request or commit message names a funder, a grant, a milestone or a report; describe a change by what it does for a user. Never write em dashes; do not hard-wrap Markdown prose.
- **Never send a transaction**, and stop any server you start.
