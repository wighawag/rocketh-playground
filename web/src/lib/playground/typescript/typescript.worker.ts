/**
 * The TypeScript worker: the transpiler for a run. In v1 it also becomes the editor's language
 * service, which is why it holds the whole of `typescript` rather than a smaller transpiler.
 *
 * Exposed with comlink: `version`, and `transpile(files)` (`./transpile.ts`).
 */
import ts from 'typescript';
import {expose} from 'comlink';
import {transpileProject} from './transpile.js';
import type {ProjectFiles} from '../project/template.js';

const api = {
	version: ts.version,
	transpile(files: ProjectFiles) {
		const t0 = performance.now();
		return {...transpileProject(ts, files), ms: performance.now() - t0};
	},
};

export type TypeScriptWorkerApi = typeof api;

expose(api);
