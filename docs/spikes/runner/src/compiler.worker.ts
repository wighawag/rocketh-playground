/// <reference lib="webworker" />
/**
 * The compiler worker: a CLASSIC worker, because soljson is an emscripten script that defines a
 * global `Module` and is loaded with `importScripts`, which a module worker does not have.
 *
 * It has no imports on purpose, so the bundle Vite emits for it is a plain script. The soljson URL
 * is the copy in this build (`public/solc/`, fetched and sha256-checked by
 * `scripts/fetch-solc.mjs`), never binaries.soliditylang.org at run time.
 *
 * In: standard-JSON input. Out: standard-JSON output, as solc returns it.
 */
type CompileRequest = {id: number; soljsonURL: string; input: string};

declare const Module: {cwrap: (name: string, ret: string, args: string[]) => (...args: unknown[]) => unknown};

let compile: ((input: string) => string) | undefined;

function load(soljsonURL: string): number {
	const t0 = performance.now();
	importScripts(soljsonURL);
	const solidityCompile = Module.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
	// No import callback: v1 compiles `contracts/` alone, so nothing is resolved.
	compile = (json: string) => solidityCompile(json, 0, 0) as string;
	return performance.now() - t0;
}

self.onmessage = (event: MessageEvent<CompileRequest | {preload: string}>) => {
	const data = event.data;
	if ('preload' in data) {
		// Loaded while the reader reads the code, so the first Deploy does not wait for it.
		const loadMs = compile ? 0 : load(data.preload);
		self.postMessage({preloaded: true, loadMs});
		return;
	}
	const {id, soljsonURL, input} = data;
	try {
		const loadMs = compile ? 0 : load(soljsonURL);
		const t1 = performance.now();
		const output = compile!(input);
		self.postMessage({id, output, loadMs, compileMs: performance.now() - t1});
	} catch (error) {
		self.postMessage({id, error: error instanceof Error ? error.message : String(error)});
	}
};
