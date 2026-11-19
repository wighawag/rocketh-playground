/**
 * The TypeScript worker's api, exposed with comlink on any endpoint, with `typescript` and the
 * declarations' loader passed in, so the node tests can serve the same api on a MessageChannel:
 *
 * - `version`, and `transpile(files)` for a run (`./transpile.ts`), available at once;
 * - the editor's language service (`./language-service.ts`), started by `startLanguageService`
 *   once the editor is usable: it loads the declarations (a separate asset in the browser,
 *   `./typescript.worker.ts`) and then answers `@valtown/codemirror-ts`'s calls (`updateFile`,
 *   `getLints`, `getAutocompletion`, `getHover`) and the session's (`setFiles`,
 *   `setArtifactTypes`). Before it has started, those answer nothing, as an empty file would.
 */
import type tsModule from 'typescript';
import {expose, type Endpoint} from 'comlink';
import {transpileProject} from './transpile.js';
import {createLanguageService, type LanguageService} from './language-service.js';
import type {Declarations} from './project-options.js';
import type {ProjectFiles} from '../project/template.js';

export type LoadDeclarations = () => Promise<Declarations>;

export function typeScriptApi(ts: typeof tsModule, loadDeclarations: LoadDeclarations) {
	let service: LanguageService | undefined;
	let starting: Promise<{loadMs: number; createMs: number}> | undefined;
	return {
		version: ts.version,
		transpile(files: ProjectFiles) {
			const t0 = performance.now();
			return {...transpileProject(ts, files), ms: performance.now() - t0};
		},

		/**
		 * Load the declarations and type `files`, checking each once so the editor's first lint is
		 * not the one that pays for building the program; resolves with how long each step took.
		 */
		startLanguageService(files: ProjectFiles) {
			starting ??= (async () => {
				const t0 = performance.now();
				const declarations = await loadDeclarations();
				const t1 = performance.now();
				const created = createLanguageService(ts, declarations, files);
				for (const path of Object.keys(files)) created.diagnostics(path);
				service = created;
				return {loadMs: t1 - t0, createMs: performance.now() - t1};
			})();
			return starting;
		},
		setFiles(files: ProjectFiles) {
			service?.setFiles(files);
		},
		setArtifactTypes(types: ProjectFiles) {
			service?.setArtifactTypes(types);
		},
		diagnostics(path: string) {
			return service?.diagnostics(path) ?? [];
		},

		// `@valtown/codemirror-ts`'s `WorkerShape`, which its editor extensions call.
		async initialize() {},
		updateFile(args: {path: string; code: string}) {
			service?.updateFile(args);
		},
		getLints(args: {path: string; diagnosticCodesToIgnore: number[]}) {
			return service?.getLints(args) ?? [];
		},
		async getAutocompletion(args: {path: string; context: {pos: number; explicit: boolean}}) {
			return (await service?.getAutocompletion(args)) ?? null;
		},
		getHover(args: {path: string; pos: number}) {
			return service?.getHover(args) ?? null;
		},
	};
}

export type TypeScriptWorkerApi = ReturnType<typeof typeScriptApi>;

export function exposeTypeScript(ts: typeof tsModule, loadDeclarations: LoadDeclarations, endpoint?: Endpoint): void {
	expose(typeScriptApi(ts, loadDeclarations), endpoint);
}
