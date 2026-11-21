---
title: 'Open in playground: a sample on rocketh.dev opens in the playground, as a project that is known to deploy'
slug: open-in-playground
---

> Launch snapshot: records intent at creation, NOT maintained. Current truth: `docs/adr/` (decisions) and the code; remaining work: `work/tasks/ready/` tasks. (The technical-detail sections below are trimmed by `to-task` once the work is tasked: they move into tasks or ADRs, and this spec settles to its durable framing of Problem, Solution, User Stories and Out of Scope.)

This follows a decision in `work/specs/tasked/rocketh-playground.md` ("Open in playground" on rocketh.dev comes right after v1). It spans three repositories: rocketh (the documentation's content), rocketh-website (the site that renders it) and this one. It lives here because the decision it follows does.

**Tasked 2026-11-20.** On this board: `project-link-overlay-encoding`, `runner-resolves-rocketh-router`, and two tasks built in other repositories that have no `work/` board, `docs-engine-code-block-actions` (template-svelte-docs) and `rocketh-website-open-in-playground` (rocketh-website). On rocketh's board: `playground-examples-check`, `playground-examples-first-batch`, `playground-examples-proxies-and-diamonds` and `playground-examples-remaining`.

## Problem Statement

A reader of rocketh.dev sees a deploy script and has to take it on trust: to try it they set up a project, install, compile and run a node. The playground (play.rocketh.dev) can run the same script in the tab, but nothing on rocketh.dev leads there with that script in it. And when one does, two things can go wrong silently. rocketh.dev documents rocketh's `main`, while the playground runs published releases, so a sample can use an option the playground's version does not have yet. And almost no sample runs on the playground's starting project as it is, because it deploys contracts the starting project does not have.

## What the documentation holds today

Counted on rocketh `origin/main` at `21cb5647` (2026-11-20), over `index.md`, `documentation/` and `hardhat-deploy/`:

- 42 pages, 318 fenced code blocks: 190 TypeScript, 71 bash, 31 text, 8 JSON, 6 Solidity, 12 other or unlabelled.
- **24 TypeScript blocks are complete deploy-script files** (they import from `../rocketh/deploy.js` and `export default deployScript(...)`), on 17 pages. Another 11 call `deployScript(` without being a complete file.
- **Only one of the 24 deploys the starting project's `Counter`** (`documentation/getting-started/`). The others deploy `GreetingsRegistry` (8), `Vault` (3), `A` / `B`, `ExampleLibrary` / `Example`, `CounterFacet` / `AdminFacet`, `GameGetters` / `GameCommit` / `GameReveal`, `MyContract`, `SimpleERC20` and others, and the pages hold only 6 Solidity blocks, 2 of them complete contracts. So a sample cannot be opened as a single file: it needs its contracts.
- 5 of the 24 use extensions the starting project's `rocketh/config.ts` does not register (`deployViaProxy`, `deployViaRouter`, `diamond`); that config registers `@rocketh/deploy`, `@rocketh/read-execute`, `@rocketh/viem` and `@rocketh/unknown-signer`. So some examples also need their own `rocketh/config.ts`.
- Some are not meant to run on a fresh chain in a tab: `documentation/fork-runs/` (a fork), the `catchUnknownSigner` samples in `hardhat-deploy/migration/` (an account rocketh cannot sign for), `documentation/sharing-contracts/` (artifacts from a package).
- The repository's `demoes/hardhat-deploy/*` cannot serve as examples as they are: their contracts are under `src/`, and several import OpenZeppelin or forge-std, while the playground compiles `contracts/` with no import callback (`web/src/lib/playground/compiler/solidity.ts`). Imports between project files are passed to solc as sources and should resolve; package imports do not.

## Solution

A sample on rocketh.dev that stands for a file of a small example project gets an "Open in playground" button. The button opens play.rocketh.dev with that example project in place of the starting project, on a fresh chain, with nothing run until the reader presses Deploy, exactly as a shared link opens today. Every example is deployed in rocketh's CI against the PUBLISHED packages before the page can change, so a button never opens something that fails.

## User Stories

1. As a reader of rocketh.dev, I want an "Open in playground" button on a deploy script, so that I can run it without setting anything up.
2. As a reader, I want the playground to open with everything the script needs (its contracts, its config), so that pressing Deploy works the first time.
3. As a reader, I want the opened project to run nothing until I press Deploy, and to ask before replacing a project I have saved, so that opening a link stays as safe as it is today.
4. As a reader, I want the file the sample stands for to be the one selected when the playground opens, so that I land on what I was reading.
5. As a reader, I want the button only on samples that run in the tab, so that a fork run or a Safe-owned step does not open as something that cannot work there.
6. As a documentation author, I want to mark a sample with the example file it stands for, in the fence's info string, so that marking is one edit.
7. As a documentation author, I want the build to fail when a marked sample differs from its example file, so that the page and the example cannot drift.
8. As a documentation author, I want every example deployed in CI against the published packages, failing like a dead link, so that a sample using an option not yet released is caught before it ships.
9. As a documentation author, I want an example to contain only what differs from the starting project, so that it stays small and the starting project's own updates reach it.
10. As a maintainer of rocketh-website, I want the link built at site build time with no network access and no copy of the template, so that the build stays as it is.
11. As a maintainer of this repository, I want the link format versioned and its encoder held to one test vector across both repositories, so that a change here cannot silently break every button on rocketh.dev.
12. As a reader on a phone, I want the button to work as a shared link does there.

## Implementation Decisions

Answered by the maintainer on 2026-11-20, taking the recommendation each time:

- **The link carries the starting project with files over it.** A new encoding of the `project` key, `2.`, holds only the example's files; the playground applies them over its starting project (`web/project-template/`, the published hardhat-deploy template). Considered and not taken: the whole project in the existing `1.` encoding (rocketh-website would need the template's files in the version this playground pins, and links grow), and `#example=<name>` fetched from rocketh.dev (a new fetch surface, and a link that lives only as long as the example).
- **The encoder is copied, not published.** rocketh-website keeps its own copy of the encoding (about forty lines today in `web/src/lib/playground/project/share-link.ts`: JSON, deflated with `fflate`, base64url without padding, the version prefix), held to this repository's by a shared test vector: a fixed set of files and the exact link value both must produce. rocketh-website gains `fflate` as a dependency, which is approved with this answer.
- **Examples live in rocketh**, as `examples/playground/<name>/`, each holding only the files that differ from the starting project (`contracts/*.sol`, `deploy/*.ts`, and `rocketh/config.ts` when the example needs another extension). A marked sample names the example and the file in its info string, for example ` ```typescript playground=proxies/deploy/01_deploy_greetings_registry.ts `, and its body must equal that file byte for byte.
- **The check runs in rocketh's CI**, as a docs test beside `test:docs:hardhat-deploy-init` (`scripts/test-doc.sh`): for each example, the published `hardhat-deploy init` template in a temporary folder, the example's files over it, `pnpm hardhat compile`, `pnpm hardhat deploy` on the in-memory network. This repository's `pnpm test:export` (`test/export/installs-and-deploys.export.ts`) is what makes that equivalent to a run in the tab.
- **The first batch** is the pages whose samples need only the extensions the starting config registers (`@rocketh/deploy`, `@rocketh/read-execute`, `@rocketh/viem`): `documentation/deploy-scripts/`, `documentation/deploy-contracts/`, `documentation/deterministic-addresses/`, `documentation/viem/` and `hardhat-deploy/typed-artifacts/`. Proxies, routers and diamonds come second. Checked at tasking: the runner already resolves `@rocketh/proxy` and `@rocketh/diamond` (`web/src/lib/playground/runner/bare-modules.ts`) but not `@rocketh/router`, which `deployViaRouter` comes from, and the `hardhat-deploy init` template does not depend on `@rocketh/diamond`.

- **Dependencies are declared by importing them** (answered 2026-11-20). Download adds every package a project imports that the template's `package.json` lacks, at the version the tab ran (task `runner-resolves-rocketh-router`), and rocketh's deploy check adds the packages an example imports, at their latest published version. This is what lets an example use `@rocketh/router` or `@rocketh/diamond`, which the `hardhat-deploy init` template does not depend on, and it replaces, for imported packages, the "no package is added" rule of `rocketh-playground`.

Also decided:

- **Opening reuses the shared-link path** (`project/open-link.ts`, `session.open()`, the confirmation over a saved project, the `project` key removed from the URL after loading). What is new is the `2.` encoding, and selecting the named file.
- **A link from rocketh.dev opens what the playground's pinned release runs.** The rocketh CI check runs the latest published template and packages, and this playground follows releases daily (`.github/workflows/follow-rocketh-releases.yml`), so the two can differ by up to a day after a release. Accepted, and stated in the docs page that explains the button.
- **Size.** An example is a few files; the existing 32 KB fragment cap (`SHARE_FRAGMENT_LIMIT`) applies, and the site build fails on an example whose link would exceed it.

## Testing Decisions

- rocketh: the example check in CI, and a test that every marked fence equals its example file.
- rocketh-website: the button renders on a marked fence only, and its link decodes (with this repository's decoder, through the shared test vector) to the example's files.
- This repository: the new encoding round-trips, a link from it opens the starting project with the files over it and the named file selected (e2e), and the shared test vector.

## Out of Scope

- Samples that need a fork, an account rocketh cannot sign for, package imports in Solidity, or artifacts from a package.
- Editing a sample in place on rocketh.dev (rocketh's `work/specs/dropped/editable-deploy-scripts-in-the-docs.md`).
- The `@rocketh/playground` widget on rocketh.dev's documentation page, which is a different thing: a fixed four-step walkthrough, not this site.
