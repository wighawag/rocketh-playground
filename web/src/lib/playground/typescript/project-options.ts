/**
 * How the editor's language service types the project, and how the build collects the
 * declarations it reads (`scripts/declarations.mjs`): the same options for both, or a package
 * would resolve one way at build time and another in the tab.
 *
 * They are `hardhat-deploy init`'s `tsconfig.json` (`web/project-template/tsconfig.json`), with
 * `lib` adding `webworker`, which is where the deploy scripts run here: it declares `console` and
 * `fetch`, and not `window` or `document`, which a script cannot touch in the playground. The
 * ES2023 lib alone, as in the editor spike, reports "Cannot find name 'console'".
 *
 * Only `import type` here, so the vite plugin can import this file at no cost.
 */
import type tsModule from 'typescript';

export const PROJECT_LIB = ['lib.es2023.d.ts', 'lib.webworker.d.ts'];

export function projectCompilerOptions(ts: typeof tsModule): tsModule.CompilerOptions {
	return {
		lib: PROJECT_LIB,
		module: ts.ModuleKind.Node16,
		moduleResolution: ts.ModuleResolutionKind.Node16,
		target: ts.ScriptTarget.ES2022,
		strict: true,
		esModuleInterop: true,
		skipLibCheck: true,
		noEmit: true,
		// Only what the project imports, not the `@types/*` the playground's own build has.
		types: [],
	};
}

/**
 * The declarations the language service is given: the packages' files laid out under
 * `/node_modules`, and the lib files at `/`, where `@typescript/vfs` looks for them.
 */
export type Declarations = {files: Record<string, string>; libs: Record<string, string>};
