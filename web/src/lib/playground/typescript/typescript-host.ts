/**
 * The TypeScript worker's api: `version`, and `transpile(files)` (`./transpile.ts`), exposed with
 * comlink on any endpoint, with `typescript` passed in, so the node tests can serve the same api
 * on a MessageChannel.
 */
import type tsModule from 'typescript';
import {expose, type Endpoint} from 'comlink';
import {transpileProject} from './transpile.js';
import type {ProjectFiles} from '../project/template.js';

export function typeScriptApi(ts: typeof tsModule) {
	return {
		version: ts.version,
		transpile(files: ProjectFiles) {
			const t0 = performance.now();
			return {...transpileProject(ts, files), ms: performance.now() - t0};
		},
	};
}

export type TypeScriptWorkerApi = ReturnType<typeof typeScriptApi>;

export function exposeTypeScript(ts: typeof tsModule, endpoint?: Endpoint): void {
	expose(typeScriptApi(ts), endpoint);
}
