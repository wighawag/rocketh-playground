import type {Plugin} from 'vite';
import {ensureSoljson} from './scripts/soljson.mjs';

/**
 * What the playground needs from the build, in one plugin:
 *
 * - **Module workers in ES format.** The runner loads each package a run imports as its own
 *   chunk (`src/lib/playground/runner/bare-modules.ts`), and a worker bundle can only be split
 *   into chunks in ES format; Vite's default for workers is `iife`. The compiler worker is still
 *   a classic worker: it has no import left once bundled, so its ES output is a plain script.
 * - **The pinned soljson in `static/solc/`** before a build or a dev server starts, fetched once
 *   and checked against `solc.json` and binaries.soliditylang.org's `list.json`
 *   (`scripts/soljson.mjs`). A test run fetches it only from the tests that compile.
 */
export function playground(): Plugin {
	return {
		name: 'rocketh-playground',
		config: () => ({worker: {format: 'es'}}),
		async buildStart() {
			if (process.env.VITEST) return;
			await ensureSoljson();
		},
	};
}
