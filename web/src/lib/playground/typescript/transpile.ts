/**
 * The project's TypeScript (and the generated JavaScript) to CommonJS, with `ts.transpileModule`.
 *
 * CommonJS because a worker has no import maps: the runner resolves each `require` through its
 * registry instead (`../runner/registry.ts`). Types are erased, not checked: a type error never
 * blocks a run. A SYNTAX error is reported with its file and line, and the run does not start.
 *
 * `typescript` is a parameter so this module costs nothing to import: the TypeScript worker passes
 * the one it holds, and the node tests pass theirs.
 */
import type tsModule from 'typescript';
import type {Diagnostic} from '../diagnostic.js';
import type {ProjectFiles} from '../project/template.js';

export type TranspileResult = {
	/** CommonJS per path, for every `.ts` and `.js` file given. */
	modules: ProjectFiles;
	/**
	 * What each module imports AT RUN TIME, read from the emitted JavaScript, so a type-only
	 * import (`import type {UserConfig} from 'rocketh/types'`) is not in it. The runner uses it
	 * to load the bare packages a run needs before evaluating anything.
	 */
	imports: Record<string, string[]>;
	diagnostics: Diagnostic[];
	ok: boolean;
};

export function transpileProject(
	ts: typeof tsModule,
	files: ProjectFiles,
): TranspileResult {
	const compilerOptions: tsModule.CompilerOptions = {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2022,
		esModuleInterop: true,
	};
	const modules: ProjectFiles = {};
	const imports: Record<string, string[]> = {};
	const diagnostics: Diagnostic[] = [];
	for (const [file, text] of Object.entries(files)) {
		if (!/\.[cm]?[jt]s$/.test(file)) continue;
		const result = ts.transpileModule(text, {
			fileName: file,
			compilerOptions,
			reportDiagnostics: true,
		});
		for (const d of result.diagnostics ?? []) {
			const at =
				d.file && d.start !== undefined
					? d.file.getLineAndCharacterOfPosition(d.start)
					: {line: 0, character: 0};
			diagnostics.push({
				file,
				line: at.line + 1,
				column: at.character + 1,
				message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
				severity:
					d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
				source: 'typescript',
			});
		}
		modules[file] = result.outputText;
		imports[file] = ts
			.preProcessFile(result.outputText, true, true)
			.importedFiles.map((f) => f.fileName);
	}
	return {
		modules,
		imports,
		diagnostics,
		ok: !diagnostics.some((d) => d.severity === 'error'),
	};
}
