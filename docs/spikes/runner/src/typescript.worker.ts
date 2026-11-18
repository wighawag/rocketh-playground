/**
 * The TypeScript worker. In v1 it is also the editor's language service; in this spike it only
 * transpiles, with `ts.transpileModule`, to CommonJS, which is what lets the runner resolve every
 * import through its registry with a plain `require` instead of import maps (workers have none).
 *
 * A syntax error comes back as a diagnostic with its file and line, and the run does not start.
 * Type errors are not looked for here: transpileModule does not type-check, and a type error
 * never blocks a run.
 */
import ts from 'typescript';
import {expose} from 'comlink';

export type Diagnostic = {file: string; line: number; column: number; message: string};
export type TranspileResult = {modules: Record<string, string>; diagnostics: Diagnostic[]; ms: number};

const compilerOptions: ts.CompilerOptions = {
	module: ts.ModuleKind.CommonJS,
	target: ts.ScriptTarget.ES2022,
	esModuleInterop: true,
	sourceMap: false,
	inlineSourceMap: false,
};

const api = {
	version: ts.version,
	transpile(files: Record<string, string>): TranspileResult {
		const t0 = performance.now();
		const modules: Record<string, string> = {};
		const diagnostics: Diagnostic[] = [];
		for (const [file, text] of Object.entries(files)) {
			const result = ts.transpileModule(text, {fileName: file, compilerOptions, reportDiagnostics: true});
			for (const d of result.diagnostics ?? []) {
				const position = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
				diagnostics.push({
					file,
					line: (position?.line ?? 0) + 1,
					column: (position?.character ?? 0) + 1,
					message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
				});
			}
			modules[file] = result.outputText;
		}
		return {modules, diagnostics, ms: performance.now() - t0};
	},
};
export type TypeScriptWorkerApi = typeof api;

expose(api);
