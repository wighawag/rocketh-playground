---
title: 'Project flavours: start from a hardhat-deploy project or a rocketh CLI project compiled with forge'
slug: project-flavours
---

# Project flavours

Captured 2026-11-20 from the maintainer's question "should we offer a hardhat vs foundry vs rocketh CLI version?". Not built, and it reverses a spec decision: `work/specs/tasked/rocketh-playground.md` lists "Foundry layouts" under "Out for good". Turning this idea into a spec means reopening that line.

## The idea

The reader picks the kind of project the playground starts from, and the kind Download writes:

- **hardhat-deploy** (today): Hardhat compiles, the hardhat-deploy plugin generates typed artifacts into `generated/artifacts/`, and `pnpm hardhat deploy` runs the scripts.
- **rocketh CLI with forge**: `forge build` writes `out/<File>.sol/<Contract>.json`, `rocketh/artifacts.ts` turns that into rocketh artifacts, and `npx rocketh -e <environment>` runs the scripts (rocketh `documentation/getting-started/index.md`, "Get started without Hardhat").

These are two flavours, not three: rocketh compiles nothing, so a "rocketh CLI" project needs some compiler, and the one rocketh documents is forge.

## What a flavour would change

In the tab, nothing about compiling or running: solc in the compiler worker and rocketh in the runner are the same for both. A flavour decides:

- the starting files (`hardhat.config.ts` and its package.json, or `foundry.toml` and the artifacts adapter);
- where the compile's output is laid out for the scripts (`generated/artifacts/` as now, or forge's `out/` JSON, which the runner's registry would serve as JSON imports);
- what Download writes and which commands its README names;
- what the export test needs installed (Foundry for the forge flavour).

The flavour would be chosen when starting a project (with Reset, or a "new project" action), saved with the files, and carried by a shared link.

## Why it waits

The playground's promise is that what works in the tab works after Download. With forge today the ABI comes from JSON, so nothing type-checks constructor arguments or calls: a forge flavour would either lose the typed editor the playground has, or show types the downloaded project does not have. rocketh's spec `forge-artifacts` (rocketh `work/specs/proposed/forge-artifacts.md`, open questions at 21cb5647) generates the same typed artifacts module for forge that hardhat-deploy generates. Once it ships, a forge flavour gets the same experience in the tab and after Download, and this idea can become a spec.
