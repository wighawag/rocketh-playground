/// <reference lib="webworker" />
/**
 * The compiler worker. CLASSIC, not a module worker: soljson is an emscripten script that defines
 * a global `Module` and is loaded with `importScripts`, which a module worker does not have.
 * Construct it with `new Worker(url)` and no `{type: 'module'}`.
 *
 * Its one import, `compileProject` (`./solidity.ts`, the same function the node tests run), is
 * inlined by the bundler, so what Vite emits is a plain script with no `import` left in it: a
 * classic worker cannot have one.
 *
 * Messages:
 * - `{type: 'load', soljsonURL}`: load the compiler now (while the reader reads the code), and
 *   answer `{type: 'loaded', loadMs}`;
 * - `{type: 'compile', id, soljsonURL, files}`: answer `{type: 'compiled', id, result, ms}`, or
 *   `{type: 'failed', id, message}` when solc itself could not run.
 */
import {compileProject, type CompileResult, type Soljson, type SolidityCompile} from './solidity.js';
import type {ProjectFiles} from '../project/template.js';

export type CompilerRequest =
	| {type: 'load'; soljsonURL: string}
	| {type: 'compile'; id: number; soljsonURL: string; files: ProjectFiles};
export type CompilerReply =
	| {type: 'loaded'; loadMs: number}
	| {type: 'compiled'; id: number; result: CompileResult; ms: number}
	| {type: 'failed'; id?: number; message: string};

declare const Module: Soljson;

let compile: SolidityCompile | undefined;

function load(soljsonURL: string): number {
	const t0 = performance.now();
	if (!compile) {
		importScripts(soljsonURL);
		const solidityCompile = Module.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
		compile = (input) => solidityCompile(input, 0, 0) as string;
	}
	return performance.now() - t0;
}

const post = (reply: CompilerReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);

self.onmessage = (event: MessageEvent<CompilerRequest>) => {
	const request = event.data;
	const id = request.type === 'compile' ? request.id : undefined;
	try {
		const loadMs = load(request.soljsonURL);
		if (request.type === 'load') {
			post({type: 'loaded', loadMs});
			return;
		}
		const t0 = performance.now();
		const result = compileProject(compile!, request.files);
		post({type: 'compiled', id: request.id, result, ms: performance.now() - t0});
	} catch (error) {
		post({type: 'failed', id, message: error instanceof Error ? error.message : String(error)});
	}
};
