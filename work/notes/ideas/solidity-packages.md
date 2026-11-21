---
title: 'Solidity packages: a contract imports OpenZeppelin (or any npm Solidity package), the tab compiles it, and Download declares it'
slug: solidity-packages
type: idea
status: incubating
created: 2026-11-20
---

# Solidity packages

Captured 2026-11-20 from the maintainer's question "can a user add a dependency like OpenZeppelin contracts?". Not built, and it reopens a v1 boundary: `work/specs/tasked/rocketh-playground.md` lists "Solidity imports (OpenZeppelin, `@rocketh/proxy`'s Solidity)" under "Out of v1, possibly later". Today the compiler hands solc `contracts/**.sol` with no import callback, so an import of a package fails, located at the import (`web/src/lib/playground/compiler/solidity.ts`).

## Two kinds of dependency, and why only this one

- **TypeScript packages a deploy script imports** run in the runner, which resolves only the packages bundled into the playground at build time (`runner/bare-modules.ts`), each with its declarations for the editor. Loading arbitrary npm code at run time would add a supply-chain surface and per-package declarations. They stay the bundled set; since task `runner-resolves-rocketh-router`, Download adds the ones a project imports.
- **Solidity packages** (`@openzeppelin/contracts`, `@openzeppelin/contracts-upgradeable`, `solady`, ...) are sources that only solc reads: nothing in them runs in the tab except through the compiler and the deployed bytecode. That makes them the dependency worth supporting.

## The shape it could take

- **Imports are npm-style**: `import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";`. The same path works in Hardhat 3 (resolved from `node_modules`), in Foundry with a remapping `@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/` (Soldeer's installs are remapped to the same prefix), and here if the resolver keys on the package name. So nothing written now has to be undone for a forge flavour (`work/notes/ideas/project-flavours.md`), whose Download would write the remapping.
- **The version is the project's**: declared in the project (a dependency entry the reader can edit, or chosen when the import is first seen and recorded), carried by Share and by a link from rocketh.dev, and written by Download into `package.json`.
- **Sources are fetched before compiling**: collect the imports transitively, fetch each package version once from the npm registry (the tarball named in its packument, checked against the packument's `dist.integrity`), unpack the `.sol` files, cache them (IndexedDB, keyed by package and version), and pass every source to solc in the standard JSON input, so no import callback is needed. A package without network access fails the compile with a message naming it.
- **The export test covers it**: a project importing `@openzeppelin/contracts` downloads, installs and deploys (`pnpm test:export`).

## What would have to be decided

- Where the reader declares or picks a version (an editable dependency list, `package.json` itself made editable, or recorded on first use).
- Whether fetching from the npm registry from the tab is acceptable (CORS and rate limits unverified here), or a CDN, and how a fetch failure reads in the editor.
- Remappings beyond the package-name prefix (a package whose own imports assume a remapping, as some Foundry-first packages do).
- Limits: package size, the number of packages, the cache's size.
- Whether `@rocketh/proxy`'s own Solidity (the vendored proxies) becomes importable the same way.
