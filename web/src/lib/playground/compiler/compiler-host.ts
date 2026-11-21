/**
 * The compiler worker's side, on any port-like scope, with soljson's loader as a parameter: the
 * worker passes one that fetches the file and `importScripts` it, the node tests one that
 * evaluates the same file in node.
 *
 * Messages:
 * - `{type: 'load', soljsonURL}`: start loading the compiler (while the reader reads the code);
 *   answered by `progress` messages and then `loaded`, or `failed`. Sent once, first;
 * - `{type: 'compile', id, files}`: waits for the compiler, then `compiled` (with the
 *   diagnostics and the artifact modules), or `failed` when solc itself could not run.
 *
 * Its only import is `./solidity.ts`, inlined by the bundler, so the worker's bundle stays a plain
 * script: a CLASSIC worker (needed for `importScripts`) cannot have an `import`.
 */
import {
	compileProject,
	solidityCompileOf,
	type CompileResult,
	type Soljson,
	type SolidityCompile,
} from './solidity.js';
import type {ProjectFiles} from '../project/template.js';

export type CompilerRequest =
	| {type: 'load'; soljsonURL: string}
	| {type: 'compile'; id: number; files: ProjectFiles};

export type CompilerReply =
	| {type: 'progress'; loaded: number}
	| {type: 'loaded'; loadMs: number}
	| {type: 'compiled'; id: number; result: CompileResult; ms: number}
	| {type: 'failed'; id?: number; message: string};

export type LoadSoljson = (
	url: string,
	onProgress: (loaded: number) => void,
) => Promise<Soljson>;

type Scope = {
	postMessage(message: unknown): void;
	addEventListener(
		type: 'message',
		listener: (event: {data: unknown}) => void,
	): void;
	start?: () => void;
};

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

export function serveCompiler(scope: Scope, loadSoljson: LoadSoljson): void {
	const post = (reply: CompilerReply) => scope.postMessage(reply);
	let compiler: Promise<SolidityCompile> | undefined;

	function load(url: string): Promise<SolidityCompile> {
		if (!compiler) {
			const t0 = performance.now();
			compiler = loadSoljson(url, (loaded) =>
				post({type: 'progress', loaded}),
			).then(solidityCompileOf);
			compiler.then(
				() => post({type: 'loaded', loadMs: performance.now() - t0}),
				(error) =>
					post({
						type: 'failed',
						message: `the Solidity compiler did not load: ${messageOf(error)}`,
					}),
			);
		}
		return compiler;
	}

	scope.addEventListener('message', (event) => {
		const request = event.data as CompilerRequest;
		if (request.type === 'load') {
			void load(request.soljsonURL).catch(() => {});
			return;
		}
		if (request.type === 'compile') {
			if (!compiler) {
				post({
					type: 'failed',
					id: request.id,
					message: 'the compiler worker was asked to compile before `load`',
				});
				return;
			}
			compiler.then(
				(compile) => {
					try {
						const t0 = performance.now();
						const result: CompileResult = compileProject(
							compile,
							request.files,
						);
						post({
							type: 'compiled',
							id: request.id,
							result,
							ms: performance.now() - t0,
						});
					} catch (error) {
						post({type: 'failed', id: request.id, message: messageOf(error)});
					}
				},
				(error) =>
					post({
						type: 'failed',
						id: request.id,
						message: `the Solidity compiler did not load: ${messageOf(error)}`,
					}),
			);
		}
	});
	scope.start?.();
}
