/**
 * A playground session: the page's side of the four workers, as a Svelte store.
 *
 * It holds the project's files, sends them out, and keeps what comes back (the compiler's
 * progress, diagnostics, the transcript, the deployment records, the chain's height). It runs no
 * user code: compiling, transpiling and running all happen in workers, and Stop ends the runner
 * worker only, so the chain (in the EVM worker) is untouched.
 *
 * The workers are a parameter (`./workers.ts` makes the browser's), so the node tests run a whole
 * session with the same hosts served on MessageChannels.
 */
import {writable, type Readable} from 'svelte/store';
import {wrap, type Endpoint, type Remote} from 'comlink';
import {createWorkerNode} from 'webevm/worker-client';
import type {SlimNode} from 'webevm';
import type {LogSource} from '@rocketh/playground/log';
import type {CompilerReply, CompilerRequest} from './compiler/compiler-host.js';
import type {CompileResult} from './compiler/solidity.js';
import type {TypeScriptWorkerApi} from './typescript/typescript-host.js';
import type {EVMNodeOptions} from './evm/evm-host.js';
import type {RunnerReply, RunnerRequest} from './runner/protocol.js';
import type {RunOutcome} from './runner/run.js';
import {CHAIN_ID} from './runner/compose-config.js';
import {INITIAL_BALANCE, TEST_ADDRESSES} from './runner/test-keys.js';
import {formatDiagnostic, type Diagnostic} from './diagnostic.js';
import {startingProject, type ProjectFiles} from './project/template.js';

/** What the session needs of a worker: a `Worker`, or a MessagePort with a `terminate` in tests. */
export type WorkerLike = {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error', listener: (event: MessageEvent & ErrorEvent) => void): void;
	terminate(): void;
};

export type PlaygroundWorkers = {
	typescript(): WorkerLike;
	/** A CLASSIC worker in a browser: soljson needs `importScripts`. */
	compiler(): WorkerLike;
	evm(): WorkerLike;
	runner(): WorkerLike;
};

export type SessionOptions = {
	workers: PlaygroundWorkers;
	soljsonURL: string;
	/** The compiler's size, shown while it loads (`solc.json`). */
	compilerBytes: number;
	/** IndexedDB database names; omit one to keep that store in memory. */
	chainDB?: string;
	deploymentsDB?: string;
	files?: ProjectFiles;
};

export type Phase = 'idle' | 'booting' | 'ready' | 'compiling' | 'transpiling' | 'running' | 'stopping' | 'failed';

export type TranscriptLine = {seq: number; source: LogSource; text: string; at: number};

export type LastRun = {
	outcome: 'deployed' | 'failed' | 'stopped';
	stage: 'compile' | 'transpile' | 'run';
	/** Transactions the run sent; 0 is "everything was deployed already". */
	sent: number;
	ms: number;
};

export type PlaygroundState = {
	phase: Phase;
	error?: string;
	compiler: {status: 'loading' | 'ready' | 'failed'; loaded: number; total: number; error?: string};
	typescriptVersion?: string;
	files: ProjectFiles;
	selected: string;
	/** The deployment store, by path: `deployments/playground/Counter.json`, `.chain`, ... */
	records: ProjectFiles;
	transcript: TranscriptLine[];
	diagnostics: Diagnostic[];
	blockNumber?: number;
	lastRun?: LastRun;
};

export type PlaygroundSession = Readable<PlaygroundState> & {
	start(): Promise<void>;
	deploy(): Promise<LastRun | undefined>;
	stop(): Promise<void>;
	edit(path: string, text: string): void;
	select(path: string): void;
	dispose(): Promise<void>;
};

/** Long transcripts keep their tail: a reader scrolls back a few runs, not a thousand. */
const TRANSCRIPT_LIMIT = 2000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createPlaygroundSession(options: SessionOptions): PlaygroundSession {
	const files = options.files ?? startingProject();
	let state: PlaygroundState = {
		phase: 'idle',
		compiler: {status: 'loading', loaded: 0, total: options.compilerBytes},
		files,
		selected: Object.keys(files).find((p) => p.startsWith('deploy/')) ?? Object.keys(files)[0],
		records: {},
		transcript: [],
		diagnostics: [],
	};
	const store = writable(state);
	const set = (patch: Partial<PlaygroundState> | ((s: PlaygroundState) => Partial<PlaygroundState>)) => {
		state = {...state, ...(typeof patch === 'function' ? patch(state) : patch)};
		store.set(state);
	};

	let seq = 0;
	function say(source: LogSource, text: string) {
		const line = {seq: seq++, source, text, at: Date.now()};
		set((s) => ({transcript: [...s.transcript, line].slice(-TRANSCRIPT_LIMIT)}));
	}

	// --- compiler ---------------------------------------------------------------------------------
	let compilerWorker: WorkerLike | undefined;
	let compileId = 0;
	const compiles = new Map<number, {resolve: (r: CompileResult) => void; reject: (e: Error) => void}>();
	let compilerLoaded: Promise<void> | undefined;

	function startCompiler() {
		compilerWorker = options.workers.compiler();
		let markLoaded: () => void = () => {};
		let markFailed: (e: Error) => void = () => {};
		compilerLoaded = new Promise<void>((resolve, reject) => {
			markLoaded = resolve;
			markFailed = reject;
		});
		compilerLoaded.catch(() => {});
		compilerWorker.addEventListener('message', (event) => {
			const reply = event.data as CompilerReply;
			if (reply.type === 'progress') {
				set((s) => ({compiler: {...s.compiler, loaded: reply.loaded}}));
			} else if (reply.type === 'loaded') {
				set((s) => ({compiler: {...s.compiler, status: 'ready', loaded: s.compiler.total}}));
				markLoaded();
			} else if (reply.type === 'compiled') {
				compiles.get(reply.id)?.resolve(reply.result);
				compiles.delete(reply.id);
			} else if (reply.type === 'failed') {
				if (reply.id === undefined) {
					set((s) => ({compiler: {...s.compiler, status: 'failed', error: reply.message}}));
					markFailed(new Error(reply.message));
				} else {
					compiles.get(reply.id)?.reject(new Error(reply.message));
					compiles.delete(reply.id);
				}
			}
		});
		const load: CompilerRequest = {type: 'load', soljsonURL: options.soljsonURL};
		compilerWorker.postMessage(load);
	}

	function compile(projectFiles: ProjectFiles): Promise<CompileResult> {
		const id = ++compileId;
		return new Promise((resolve, reject) => {
			compiles.set(id, {resolve, reject});
			const request: CompilerRequest = {type: 'compile', id, files: projectFiles};
			compilerWorker!.postMessage(request);
		});
	}

	// --- TypeScript, chain ------------------------------------------------------------------------
	let typescriptWorker: WorkerLike | undefined;
	let typescript: Remote<TypeScriptWorkerApi> | undefined;
	let node: SlimNode | undefined;

	async function refreshBlockNumber() {
		if (!node) return;
		set({blockNumber: Number(await node.request({method: 'eth_blockNumber'} as never))});
	}

	// --- runner -----------------------------------------------------------------------------------
	type Runner = {
		worker: WorkerLike;
		served: {close(): Promise<void>};
		pending?: {id: number; resolve: (r: RunOutcome | 'stopped') => void};
	};
	let runner: Runner | undefined;
	let runId = 0;

	async function startRunner(): Promise<void> {
		const worker = options.workers.runner();
		const channel = new MessageChannel();
		const served = await node!.serveOn(channel.port1);
		const current: Runner = {worker, served};
		const ready = new Promise<void>((resolve, reject) => {
			worker.addEventListener('error', (event) => reject(new Error(`the runner worker failed: ${event.message}`)));
			worker.addEventListener('message', (event) => {
				// A runner that was stopped has no say any more (`runner` is set before any reply).
				if (runner !== current) return;
				const reply = event.data as RunnerReply;
				switch (reply.type) {
					case 'ready':
						set({records: reply.files});
						resolve();
						break;
					case 'init-failed':
						reject(new Error(reply.message));
						break;
					case 'log':
						say(reply.entry.source, reply.entry.text);
						break;
					case 'store':
						set((s) => {
							if (reply.change === 'restore') return {records: reply.files};
							if (reply.change === 'write') return {records: {...s.records, [reply.path]: reply.content}};
							const records = Object.fromEntries(
								Object.entries(s.records).filter(([p]) => p !== reply.path && !p.startsWith(`${reply.path}/`)),
							);
							return {records};
						});
						break;
					case 'done':
						if (current.pending?.id === reply.id) {
							current.pending.resolve(reply.outcome);
							current.pending = undefined;
						}
						break;
				}
			});
		});
		const init: RunnerRequest = {type: 'init', provider: channel.port2, deploymentsDB: options.deploymentsDB};
		worker.postMessage(init, [channel.port2]);
		runner = current;
		await ready;
	}

	// --- lifecycle --------------------------------------------------------------------------------
	async function start() {
		if (state.phase !== 'idle') return;
		set({phase: 'booting'});
		try {
			// The compiler first: it is the long download, and it loads while the rest boots.
			startCompiler();
			typescriptWorker = options.workers.typescript();
			typescript = wrap<TypeScriptWorkerApi>(typescriptWorker as unknown as Endpoint);
			const evmOptions: EVMNodeOptions & {worker: WorkerLike} = {
				worker: options.workers.evm(),
				chainId: CHAIN_ID,
				initialBalances: Object.fromEntries(TEST_ADDRESSES.map((a) => [a, INITIAL_BALANCE])),
				...(options.chainDB ? {indexedDB: options.chainDB} : {}),
			};
			node = await createWorkerNode(evmOptions as never);
			await startRunner();
			set({typescriptVersion: await typescript.version});
			await refreshBlockNumber();
			set({phase: 'ready'});
		} catch (error) {
			set({phase: 'failed', error: messageOf(error)});
			say('error', `The playground could not start: ${messageOf(error)}`);
		}
	}

	async function deploy(): Promise<LastRun | undefined> {
		if (state.phase !== 'ready') return undefined;
		const t0 = performance.now();
		const projectFiles = state.files;
		const finish = (run: Omit<LastRun, 'ms'>): LastRun => {
			const lastRun = {...run, ms: performance.now() - t0};
			set({lastRun, phase: state.phase === 'failed' ? 'failed' : 'ready'});
			return lastRun;
		};
		say('playground', 'Deploy');
		set({phase: 'compiling', diagnostics: []});
		let compiled: CompileResult;
		try {
			await compilerLoaded;
			compiled = await compile(projectFiles);
		} catch (error) {
			say('error', messageOf(error));
			return finish({outcome: 'failed', stage: 'compile', sent: 0});
		}
		set({diagnostics: compiled.diagnostics});
		for (const d of compiled.diagnostics) say(d.severity === 'error' ? 'error' : 'warning', formatDiagnostic(d));
		if (!compiled.ok) {
			say('error', 'The contracts did not compile; nothing was sent.');
			return finish({outcome: 'failed', stage: 'compile', sent: 0});
		}

		set({phase: 'transpiling'});
		const transpiled = await typescript!.transpile({...projectFiles, ...compiled.artifacts});
		if (transpiled.diagnostics.length > 0) {
			set((s) => ({diagnostics: [...s.diagnostics, ...transpiled.diagnostics]}));
			for (const d of transpiled.diagnostics) say(d.severity === 'error' ? 'error' : 'warning', formatDiagnostic(d));
		}
		if (!transpiled.ok) {
			say('error', 'A script did not parse; nothing was sent.');
			return finish({outcome: 'failed', stage: 'transpile', sent: 0});
		}

		set({phase: 'running'});
		const current = runner!;
		const id = ++runId;
		const result = await new Promise<RunOutcome | 'stopped'>((resolve) => {
			current.pending = {id, resolve};
			const request: RunnerRequest = {type: 'run', id, modules: transpiled.modules, imports: transpiled.imports};
			current.worker.postMessage(request);
		});
		await refreshBlockNumber();
		if (result === 'stopped') return finish({outcome: 'stopped', stage: 'run', sent: 0});
		const sent = result.requests.eth_sendRawTransaction ?? 0;
		const ms = performance.now() - t0;
		if (result.ok) {
			say(
				'success',
				sent === 0
					? `Done in ${ms.toFixed(0)} ms: nothing to send, everything is deployed already.`
					: `Done in ${ms.toFixed(0)} ms: ${sent} transaction${sent === 1 ? '' : 's'} sent.`,
			);
		}
		return finish({outcome: result.ok ? 'deployed' : 'failed', stage: 'run', sent});
	}

	async function stop() {
		if (state.phase !== 'running' || !runner) return;
		const stopped = runner;
		set({phase: 'stopping'});
		// Terminating the worker is the only way to end a script that never yields.
		stopped.worker.terminate();
		await stopped.served.close();
		say('playground', 'Stopped: the runner was ended. The chain and the records are untouched.');
		try {
			await startRunner();
		} catch (error) {
			set({phase: 'failed', error: messageOf(error)});
			say('error', `The runner could not restart: ${messageOf(error)}`);
		}
		stopped.pending?.resolve('stopped');
		stopped.pending = undefined;
	}

	function edit(path: string, text: string) {
		set((s) => ({files: {...s.files, [path]: text}}));
	}

	function select(path: string) {
		set({selected: path});
	}

	async function dispose() {
		runner?.worker.terminate();
		await runner?.served.close().catch(() => {});
		compilerWorker?.terminate();
		typescriptWorker?.terminate();
		await node?.dispose().catch(() => {});
		runner = undefined;
		node = undefined;
		set({phase: 'idle'});
	}

	return {subscribe: store.subscribe, start, deploy, stop, edit, select, dispose};
}
