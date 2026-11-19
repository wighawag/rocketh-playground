import type {Plugin} from 'vite';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import ts from 'typescript';
import {ensureSoljson} from './scripts/soljson.mjs';
import {collectDeclarations} from './scripts/declarations.mjs';
import {BARE_MODULE_NAMES, TYPE_ONLY_MODULES} from './src/lib/playground/runner/bare-modules.js';
import {projectCompilerOptions} from './src/lib/playground/typescript/project-options.js';

const DECLARATIONS = new URL('./src/lib/playground/typescript/generated/declarations.json', import.meta.url);

/** The language service's declarations, written where the TypeScript worker imports them `?url`. */
function writeDeclarations() {
	const {files, libs} = collectDeclarations({
		specifiers: [...BARE_MODULE_NAMES, ...TYPE_ONLY_MODULES],
		compilerOptions: projectCompilerOptions(ts),
	});
	const json = JSON.stringify({files, libs});
	if (existsSync(DECLARATIONS) && readFileSync(DECLARATIONS, 'utf8') === json) return;
	mkdirSync(new URL('.', DECLARATIONS), {recursive: true});
	writeFileSync(DECLARATIONS, json);
}

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
 * - **The editor's declarations** in `src/lib/playground/typescript/generated/declarations.json`
 *   (git-ignored): the lib files and the `.d.ts` of every package a project may import, as
 *   TypeScript reads them (`scripts/declarations.mjs`). The TypeScript worker imports the file
 *   `?url`, so it is a hashed asset fetched after the editor is usable, not part of the worker.
 */
export function playground(): Plugin {
	return {
		name: 'rocketh-playground',
		config: () => ({worker: {format: 'es'}}),
		async buildStart() {
			if (process.env.VITEST) return;
			writeDeclarations();
			await ensureSoljson();
		},
	};
}
