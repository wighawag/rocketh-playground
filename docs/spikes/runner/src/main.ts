/**
 * The spike's page: four workers, and no user code on this thread.
 *
 * 1. TypeScript worker: transpiles the template's files (and the generated artifacts) to CommonJS.
 * 2. Compiler worker (classic): soljson 0.8.28 from this build, compiles `contracts/*.sol`.
 * 3. EVM worker: webevm, persisted in IndexedDB, serving a MessagePort to the runner.
 * 4. Runner worker: resolves the transpiled modules through its registry and runs the deploy
 *    scripts through `@rocketh/web`, its provider being that port, its records in IndexedDB.
 *
 * Everything is timed, and `window.spike` is what `measure.mjs` drives.
 */
import {wrap} from 'comlink';
import {createWorkerNode} from 'webevm/worker-client';
import type {SlimNode} from 'webevm';
import solc from './solc-version.json';
import {generateArtifactModules, standardJSONInput, type SolcOutput} from './artifacts.js';
import {CHAIN_ID, TEST_ADDRESSES} from './compose-config.js';
import type {LogEntry, RunnerReply} from './protocol.js';
import type {TypeScriptWorkerApi} from './typescript.worker.js';
import type {EVMNodeOptions} from './evm.worker.js';

const CHAIN_DB = 'playground-chain';
const DEPLOYMENTS_DB = 'playground-deployments';

// The template's files, from the published hardhat-deploy tarball (scripts/fetch-template.mjs).
const TEMPLATE = Object.fromEntries(
	Object.entries(import.meta.glob('../template/**/*', {query: '?raw', import: 'default', eager: true}) as Record<string, string>).map(
		([path, text]) => [path.slice('../template/'.length), text],
	),
);

const LOOP_SCRIPT = `import {deployScript} from '../rocketh/deploy.js';

export default deployScript(
	async () => {
		console.log('looping forever');
		while (true) {}
	},
	{tags: ['Loop'], dependencies: ['Counter']},
);
`;
const EDITED_COUNTER = (TEMPLATE['contracts/Counter.sol'] ?? '').replace(
	'incBy: increment should be positive',
	'incBy: the increment must be positive',
);

// ---------------------------------------------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;
const transcript: LogEntry[] = [];
function show(source: string, text: string) {
	transcript.push({seq: transcript.length, source, text, at: Date.now()});
	$('log').textContent += `[${source}] ${text}\n`;
}
let records: Record<string, string> = {};
function renderRecords() {
	$('files').textContent = Object.keys(records).sort().join('\n') || '(empty)';
}

// --- 1. TypeScript worker -----------------------------------------------------------------------
const tsWorker = wrap<TypeScriptWorkerApi>(new Worker(new URL('./typescript.worker.ts', import.meta.url), {type: 'module'}));

// --- 2. compiler worker (classic: no {type: 'module'}) ------------------------------------------
const soljsonURL = new URL(solc.path, document.baseURI).href;
const compilerWorker = new Worker(new URL('./compiler.worker.ts', import.meta.url));
const compilerLoaded = new Promise<number>((resolve) => {
	compilerWorker.addEventListener('message', function onLoaded(event) {
		if (event.data?.preloaded) {
			compilerWorker.removeEventListener('message', onLoaded);
			resolve(event.data.loadMs);
		}
	});
});
let compileId = 0;
function compile(sources: Record<string, string>): Promise<{output: SolcOutput; compileMs: number}> {
	const id = ++compileId;
	return new Promise((resolve, reject) => {
		compilerWorker.addEventListener('message', function onReply(event) {
			if (event.data?.id !== id) return;
			compilerWorker.removeEventListener('message', onReply);
			if (event.data.error) reject(new Error(event.data.error));
			else resolve({output: JSON.parse(event.data.output), compileMs: event.data.compileMs});
		});
		compilerWorker.postMessage({id, soljsonURL, input: JSON.stringify(standardJSONInput(sources))});
	});
}

// --- 3. EVM worker ------------------------------------------------------------------------------
let node: SlimNode;
async function bootChain(): Promise<number> {
	const t0 = performance.now();
	const worker = new Worker(new URL('./evm.worker.ts', import.meta.url), {type: 'module'});
	node = await createWorkerNode({
		worker,
		chainId: CHAIN_ID,
		initialBalances: Object.fromEntries(TEST_ADDRESSES.map((a) => [a, 10n ** 22n])),
		indexedDB: CHAIN_DB,
	} as EVMNodeOptions as never);
	return performance.now() - t0;
}

// --- 4. runner worker ---------------------------------------------------------------------------
let runner: Worker | undefined;
let served: {close(): Promise<void>} | undefined;
let pending: {resolve: (r: RunnerReply) => void} | undefined;
let recordSavedAt: number | undefined;

async function startRunner(): Promise<number> {
	const t0 = performance.now();
	const worker = new Worker(new URL('./runner.worker.ts', import.meta.url), {type: 'module'});
	const channel = new MessageChannel();
	served = await node.serveOn(channel.port1);
	const ready = new Promise<void>((resolve, reject) => {
		worker.addEventListener('error', (e) => reject(new Error(`runner worker: ${e.message}`)));
		worker.addEventListener('message', (event: MessageEvent<RunnerReply>) => {
			const reply = event.data;
			switch (reply.type) {
				case 'ready':
					records = reply.files;
					renderRecords();
					resolve();
					break;
				case 'snapshot':
					records = reply.files;
					renderRecords();
					break;
				case 'log':
					show(reply.entry.source, reply.entry.text);
					break;
				case 'store':
					if (reply.change === 'write') {
						records[reply.path] = reply.content!;
						if (reply.path.endsWith('/Counter.json')) recordSavedAt = performance.now();
					} else {
						for (const path of Object.keys(records)) {
							if (path === reply.path || path.startsWith(reply.path + '/')) delete records[path];
						}
					}
					renderRecords();
					break;
				case 'done':
				case 'error':
					pending?.resolve(reply);
					pending = undefined;
					break;
			}
		});
	});
	worker.postMessage({type: 'init', port: channel.port2, db: DEPLOYMENTS_DB}, [channel.port2]);
	runner = worker;
	await ready;
	return performance.now() - t0;
}

// --- Deploy / Stop ------------------------------------------------------------------------------
type DeployOptions = {loop?: boolean; edit?: boolean; files?: Record<string, string>};
export type DeployResult = {
	ok: boolean;
	stage?: 'compile' | 'transpile' | 'run' | 'stopped';
	error?: string;
	errorName?: string;
	timings: Record<string, number>;
	counts?: Record<string, number>;
	deployments?: Record<string, string>;
};

async function deploy(options: DeployOptions = {}): Promise<DeployResult> {
	const timings: Record<string, number> = {};
	const t0 = performance.now();
	recordSavedAt = undefined;
	const files: Record<string, string> = {...TEMPLATE};
	if (options.edit) files['contracts/Counter.sol'] = EDITED_COUNTER;
	if (options.loop) files['deploy/02_loop.ts'] = LOOP_SCRIPT;
	Object.assign(files, options.files ?? {});
	show('playground', `Deploy${options.edit ? ' (Counter.sol edited)' : ''}${options.loop ? ' (with deploy/02_loop.ts)' : ''}`);

	// compile
	timings.waitCompilerLoad = (await compilerLoaded, performance.now() - t0);
	const sources = Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith('.sol') && !p.endsWith('.t.sol')));
	const {output, compileMs} = await compile(sources);
	timings.compile = compileMs;
	const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
	if (errors.length > 0) {
		for (const e of errors) show('error', e.formattedMessage);
		return {ok: false, stage: 'compile', error: errors[0].formattedMessage, timings};
	}
	const generated = generateArtifactModules(output);

	// transpile
	const t1 = performance.now();
	const toTranspile = {
		...Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith('.ts'))),
		...generated,
	};
	const {modules, diagnostics, ms} = await tsWorker.transpile(toTranspile);
	timings.transpile = performance.now() - t1;
	timings.transpileInWorker = ms;
	if (diagnostics.length > 0) {
		for (const d of diagnostics) show('error', `${d.file}:${d.line}:${d.column} ${d.message}`);
		return {ok: false, stage: 'transpile', error: diagnostics[0].message, timings};
	}

	// run
	const t2 = performance.now();
	const scripts = Object.keys(modules).filter((p) => p.startsWith('deploy/')).sort();
	const reply = await new Promise<RunnerReply | {type: 'stopped'}>((resolve) => {
		pending = {resolve};
		stopRequested = () => resolve({type: 'stopped'});
		runner!.postMessage({type: 'run', modules, scripts});
	});
	stopRequested = undefined;
	timings.run = performance.now() - t2;
	timings.total = performance.now() - t0;
	if (recordSavedAt !== undefined) timings.toCounterRecord = recordSavedAt - t0;
	if (reply.type === 'done') {
		show('playground', `done in ${timings.total.toFixed(0)} ms; requests: ${JSON.stringify(reply.counts)}`);
		return {ok: true, timings, counts: reply.counts, deployments: reply.deployments};
	}
	if (reply.type === 'error') return {ok: false, stage: 'run', error: reply.message, errorName: reply.name, timings, counts: reply.counts};
	return {ok: false, stage: 'stopped', timings};
}

let stopRequested: (() => void) | undefined;
async function stop(): Promise<number> {
	const t0 = performance.now();
	// Terminating the worker is the only way to end a script that never yields.
	runner?.terminate();
	await served?.close();
	pending = undefined;
	stopRequested?.();
	show('playground', 'stopped: the runner was terminated; the chain is untouched');
	await startRunner();
	return performance.now() - t0;
}

// --- boot ---------------------------------------------------------------------------------------
async function deleteDatabase(name: string) {
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => resolve();
	});
}

const boot: Record<string, number> = {};
async function main() {
	const t0 = performance.now();
	if (location.hash === '#fresh') {
		await deleteDatabase(CHAIN_DB);
		await deleteDatabase(DEPLOYMENTS_DB);
		history.replaceState(null, '', location.pathname);
	}
	compilerWorker.postMessage({preload: soljsonURL});
	void compilerLoaded.then((ms) => {
		boot.compilerLoad = ms;
		boot.compilerReadyAt = performance.now() - t0;
	});
	const tsVersion = await tsWorker.version;
	boot.typescriptReadyAt = performance.now() - t0;
	boot.chainBoot = await bootChain();
	boot.runnerBoot = await startRunner();
	boot.readyAt = performance.now() - t0;
	const blockNumber = Number(await node.request({method: 'eth_blockNumber'} as never));
	show('playground', `TypeScript ${tsVersion}, solc ${solc.version}, chain ${CHAIN_ID} at block ${blockNumber}, ${Object.keys(records).length} record files restored`);
	$('status').textContent = 'ready';
	($('deploy') as HTMLButtonElement).disabled = false;
	($('stop') as HTMLButtonElement).disabled = false;
	(window as unknown as {spike: unknown}).spike = {
		boot,
		deploy,
		stop,
		records: () => records,
		transcript: () => transcript,
		blockNumber: async () => Number(await node.request({method: 'eth_blockNumber'} as never)),
		getCode: (address: string) => node.request({method: 'eth_getCode', params: [address, 'latest']} as never),
		compilerLoaded,
	};
}

$('deploy').addEventListener('click', () => {
	void deploy({loop: ($('loop') as HTMLInputElement).checked, edit: ($('edit') as HTMLInputElement).checked});
});
$('stop').addEventListener('click', () => void stop());

main().catch((error) => {
	show('error', `boot failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
	(window as unknown as {spike: unknown}).spike = {bootError: String(error)};
});

