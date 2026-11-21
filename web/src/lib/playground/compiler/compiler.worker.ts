/// <reference lib="webworker" />
/**
 * The compiler worker. CLASSIC, not a module worker: soljson is an emscripten script that defines
 * a global `Module` and is loaded with `importScripts`, which a module worker does not have.
 * Construct it with `new Worker(url)` and no `{type: 'module'}`.
 *
 * The file is FETCHED (so the page can show how much has arrived) and then run with
 * `importScripts` on a blob URL of what arrived. See `./compiler-host.ts` for the messages.
 */
import {serveCompiler} from './compiler-host.js';
import type {Soljson} from './solidity.js';

declare const Module:
	| (Soljson & {calledRun?: boolean; onRuntimeInitialized?: () => void})
	| undefined;

async function loadSoljson(
	url: string,
	onProgress: (loaded: number) => void,
): Promise<Soljson> {
	const response = await fetch(url);
	if (!response.ok || !response.body)
		throw new Error(`HTTP ${response.status} for ${response.url}`);
	const reader = response.body.getReader();
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let loaded = 0;
	for (;;) {
		const {done, value} = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.length;
		onProgress(loaded);
	}
	const blobURL = URL.createObjectURL(
		new Blob(chunks, {type: 'text/javascript'}),
	);
	try {
		importScripts(blobURL);
	} finally {
		URL.revokeObjectURL(blobURL);
	}
	if (typeof Module === 'undefined')
		throw new Error('soljson defined no Module');
	const soljson = Module;
	// With its wasm inlined, soljson has usually finished initialising by now; wait if not.
	if (!soljson.calledRun)
		await new Promise<void>(
			(resolve) => (soljson.onRuntimeInitialized = resolve),
		);
	return soljson;
}

serveCompiler(
	self as unknown as Parameters<typeof serveCompiler>[0],
	loadSoljson,
);
