/**
 * The editor's TypeScript language service: diagnostics, completion and hover for the project's
 * files, on a virtual file system holding the declarations of every package a project may import
 * (`scripts/declarations.mjs`) and the artifact types of the last successful compile.
 *
 * It lives in the TypeScript worker, beside the transpiler, so one worker holds TypeScript. It
 * only TYPES the project: a run is transpiled with `transpileModule` (`./transpile.ts`), which
 * does not type-check, so a type error here never blocks Deploy.
 *
 * Paths: a project path (`deploy/01_deploy_counter.ts`) is `/deploy/01_deploy_counter.ts` here;
 * the editor's facet uses the same (`vfsPath`). The project root has a `package.json` with
 * `"type": "module"`, as the template's has, which `node16` resolution needs to read the files as
 * ES modules.
 *
 * `typescript` is a parameter, as for the transpiler, so the node tests drive the same service.
 */
import type tsModule from 'typescript';
import {
	createSystem,
	createVirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import {
	getAutocompletion,
	getHover,
	getLints,
} from '@valtown/codemirror-ts/worker';
import type {Diagnostic} from '../diagnostic.js';
import type {ProjectFiles} from '../project/template.js';
import {projectCompilerOptions, type Declarations} from './project-options.js';
import {isTyped, vfsPath} from './language-service-paths.js';

export {isTyped, vfsPath};

const ARTIFACTS = 'generated/artifacts/';

export type LanguageService = ReturnType<typeof createLanguageService>;

export function createLanguageService(
	ts: typeof tsModule,
	declarations: Declarations,
	files: ProjectFiles = {},
) {
	const fsMap = new Map<string, string>();
	for (const [path, text] of Object.entries(declarations.libs))
		fsMap.set(path, text);
	for (const [path, text] of Object.entries(declarations.files))
		fsMap.set(path, text);
	fsMap.set('/package.json', JSON.stringify({type: 'module'}));
	const typed = Object.entries(files).filter(([path]) => isTyped(path));
	for (const [path, text] of typed) fsMap.set(vfsPath(path), text);
	const env = createVirtualTypeScriptEnvironment(
		createSystem(fsMap),
		typed.map(([path]) => vfsPath(path)),
		ts,
		projectCompilerOptions(ts),
	);
	/** The artifact declarations the service holds now, to drop the ones a compile no longer makes. */
	let artifactTypes = new Set(
		typed.map(([path]) => path).filter((path) => path.startsWith(ARTIFACTS)),
	);

	function setFile(path: string, text: string) {
		if (!isTyped(path)) return;
		const at = vfsPath(path);
		// `createFile` also makes it a root file; an empty text is a file, not a deletion.
		if (env.getSourceFile(at)) env.updateFile(at, text || ' ');
		else env.createFile(at, text || ' ');
	}

	function deleteFile(path: string) {
		if (env.getSourceFile(vfsPath(path))) env.deleteFile(vfsPath(path));
	}

	return {
		setFile,
		deleteFile,
		/** Every typed file of the project, as the session holds them now. */
		setFiles(projectFiles: ProjectFiles) {
			for (const [path, text] of Object.entries(projectFiles))
				setFile(path, text);
		},
		/** The `generated/artifacts/*.d.ts` of a compile (`../compiler/solidity.ts`), replacing the last. */
		setArtifactTypes(types: ProjectFiles) {
			for (const path of artifactTypes) if (!(path in types)) deleteFile(path);
			for (const [path, text] of Object.entries(types)) setFile(path, text);
			artifactTypes = new Set(Object.keys(types));
		},
		/** The diagnostics of one project file, located as the rest of the playground locates them. */
		diagnostics(path: string): Diagnostic[] {
			const at = vfsPath(path);
			if (!env.getSourceFile(at)) return [];
			const found = [
				...env.languageService.getSyntacticDiagnostics(at),
				...env.languageService.getSemanticDiagnostics(at),
			];
			return found.map((d) => {
				const position =
					d.file && d.start !== undefined
						? d.file.getLineAndCharacterOfPosition(d.start)
						: {line: 0, character: 0};
				return {
					file: path,
					line: position.line + 1,
					column: position.character + 1,
					message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
					severity:
						d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
					source: 'typescript',
				};
			});
		},
		// What `@valtown/codemirror-ts`'s editor extensions call (its `WorkerShape`), with `path`
		// being the language service's path (`vfsPath`).
		updateFile({path, code}: {path: string; code: string}) {
			setFile(path.slice(1), code);
		},
		getLints({
			path,
			diagnosticCodesToIgnore,
		}: {
			path: string;
			diagnosticCodesToIgnore: number[];
		}) {
			return getLints({env, path, diagnosticCodesToIgnore});
		},
		getAutocompletion({
			path,
			context,
		}: {
			path: string;
			context: {pos: number; explicit: boolean};
		}) {
			return getAutocompletion({env, path, context});
		},
		getHover({path, pos}: {path: string; pos: number}) {
			return getHover({env, path, pos});
		},
	};
}
