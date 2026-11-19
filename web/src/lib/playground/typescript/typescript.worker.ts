/**
 * The TypeScript worker: the transpiler for a run and the editor's language service
 * (`./typescript-host.ts`), one copy of `typescript` for both.
 *
 * The declarations the language service reads (the lib files and every package a project may
 * import, about 10 MB of `.d.ts`, most of it viem's) are NOT in this bundle: they are a separate
 * asset, written by the build (`vite.playground.ts`, `scripts/declarations.mjs`) and fetched only
 * when the session starts the language service, so a run never waits for them.
 */
import ts from 'typescript';
import declarationsURL from './generated/declarations.json?url';
import {exposeTypeScript} from './typescript-host.js';
import type {Declarations} from './project-options.js';

exposeTypeScript(ts, async () => {
	const response = await fetch(declarationsURL);
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${response.url}`);
	return (await response.json()) as Declarations;
});
