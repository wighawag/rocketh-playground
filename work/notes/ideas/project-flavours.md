---
title: 'Project flavours: start from a hardhat-deploy project, a rocketh CLI project compiled with forge, or one compiled with solc'
slug: project-flavours
---

# Project flavours

Captured 2026-11-20 from the maintainer's question "should we offer a hardhat vs foundry vs rocketh CLI version?". Not built, and it reverses a spec decision: `work/specs/tasked/rocketh-playground.md` lists "Foundry layouts" under "Out for good". Turning this idea into a spec means reopening that line.

## The idea

The reader picks the kind of project the playground starts from, and the kind Download writes:

- **hardhat-deploy** (today): Hardhat compiles, the hardhat-deploy plugin generates typed artifacts into `generated/artifacts/`, and `pnpm hardhat deploy` runs the scripts.
- **rocketh CLI with forge**: `forge build` writes `out/<File>.sol/<Contract>.json`, `rocketh/artifacts.ts` turns that into rocketh artifacts, and `npx rocketh -e <environment>` runs the scripts (rocketh `documentation/getting-started/index.md`, "Get started without Hardhat").
- **rocketh CLI with solc**: a `@rocketh/solc` package (a proposal, to be made in the rocketh repository) compiles `contracts/` with the `solc` npm package and writes the typed artifacts module hardhat-deploy generates (`generated/artifacts/`, one `as const` export per contract), then `npx rocketh -e <environment>` runs the scripts. No Hardhat, no Foundry.

rocketh compiles nothing, so a "rocketh CLI" project needs some compiler: forge is the one rocketh documents today (its getting-started page says "Swap `forge` for solc or another tool and only the artifacts file changes"), and `@rocketh/solc` would be the second.

## Why `@rocketh/solc` fits the playground best

The playground already compiles with soljson in its compiler worker and already generates that typed artifacts module from the output (`web/src/lib/playground/compiler/solidity.ts`). The `solc` npm package wraps the same soljson (the wrapper is MIT, the compiler GPL-3.0). So with `@rocketh/solc` the tab and the downloaded project compile the same way with the same code: the playground could use the package itself in its compiler worker, if the package's core runs in a worker as well as in node (soljson is loaded with `importScripts` in the tab and `require` in node, so the package would take the loaded compiler as a parameter). This flavour does not wait on `forge-artifacts`, and the playground's own compile and the export test would both exercise the package.

Open in the rocketh repository: the package's API (a function taking the sources and a loaded compiler, plus a CLI or a `rocketh` subcommand for projects), how it picks the solc version (pinned in the project's config, downloaded and checked against binaries.soliditylang.org's `list.json` as the playground's build does), and whether it shares hardhat-deploy's typed-artifacts generator, as `forge-artifacts` proposes for forge.

## What a flavour would change

In the tab, nothing about compiling or running: solc in the compiler worker and rocketh in the runner are the same for both. A flavour decides:

- the starting files (`hardhat.config.ts` and its package.json, or `foundry.toml` and the artifacts adapter);
- where the compile's output is laid out for the scripts (`generated/artifacts/` as now, or forge's `out/` JSON, which the runner's registry would serve as JSON imports);
- what Download writes and which commands its README names;
- what the export test needs installed (Foundry for the forge flavour).

The flavour would be chosen when starting a project (with Reset, or a "new project" action), saved with the files, and carried by a shared link.

## Why the forge flavour waits

The playground's promise is that what works in the tab works after Download. With forge today the ABI comes from JSON, so nothing type-checks constructor arguments or calls: a forge flavour would either lose the typed editor the playground has, or show types the downloaded project does not have. rocketh's spec `forge-artifacts` (rocketh `work/specs/proposed/forge-artifacts.md`, open questions at 21cb5647) generates the same typed artifacts module for forge that hardhat-deploy generates. Once it ships, a forge flavour gets the same experience in the tab and after Download, and the forge flavour can become part of a spec. The solc flavour can come first, once `@rocketh/solc` exists.
