/**
 * A playground session: the page's side of the four workers, as a Svelte store.
 *
 * It holds the project's files, sends them out, and keeps what comes back (the compiler's
 * progress, diagnostics, the transcript, the deployment records, the chain's height). It runs no
 * user code: compiling, transpiling and running all happen in workers, and Stop ends the runner
 * worker only, so the chain (in the EVM worker) is untouched.
 *
 * The workers are a parameter (`./workers.ts` makes the browser's), so the node tests run a whole
 * session with the same hosts served on MessageChannels. So are the IndexedDB databases: the chain
 * and the records are kept by their workers, the files and the selection by the session itself
 * (`./project/saved-project.ts`), opened before anything reads them.
 *
 * It is also the source of truth for the editor: the editor dispatches each edit here (`edit`),
 * and the session forwards it to the TypeScript worker's language service, which it starts after
 * the rest has booted (the syntax-only editor is usable before). The language service types
 * `artifacts.Counter` from the declarations a compile generates, which exist before any Deploy:
 * the session compiles the project in the background as soon as the compiler is ready, and again
 * (debounced) after each edit to a `.sol` file.
 *
 * The Contracts view reads and writes through it too: `provider()` is the node, for reads, and
 * `transact()` runs one write with the chain to itself (phase `sending`), only while the session
 * is `ready`, so a write never lands between a run's nonce lookup and its send.
 *
 * `reset()` is the one action that touches the chain: only while `ready` (phase `resetting`), it
 * ends the runner and the EVM worker, and starts both again `fresh` (a chain at block 0, an empty
 * deployment store, each saved over its database), with the starting project's files saved over
 * the reader's. `open(files)` is the same with a shared link's files in place of the starting
 * project's: the link's contracts never meet another project's deployments.
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
import {CHAIN_ID, STATE_HISTORY_BLOCKS} from './runner/compose-config.js';
import {INITIAL_BALANCE, TEST_ADDRESSES} from './runner/test-keys.js';
import {formatDiagnostic, type Diagnostic} from './diagnostic.js';
import {phaseLabel} from './format.js';
import {startingProject, type ProjectFiles} from './project/template.js';
import {openSavedProject, type SavedProject} from './project/saved-project.js';
import {MIGRATION_GUIDE_LABEL, MIGRATION_GUIDE_URL, V1_SCRIPT_HINT, looksLikeV1Script} from './migration.js';

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
	/**
	 * The project's files and which one is selected. With one, `start()` opens what the last session
	 * on it left, or `files` when it holds nothing yet, and every edit is written back.
	 */
	filesDB?: string;
	/** The project a session starts from (with `filesDB`: only while that database is empty). */
	files?: ProjectFiles;
	/** How long after the last edit to a `.sol` file the background compile starts. */
	compileDebounceMs?: number;
};

export type LanguageServiceState = {
	status: 'off' | 'loading' | 'ready' | 'failed';
	/**
	 * From `start()` to the language service answering, how long its declarations took to load,
	 * and how long building and first checking the program took in the worker.
	 */
	readyMs?: number;
	loadMs?: number;
	createMs?: number;
	error?: string;
};

export type Phase =
	| 'idle'
	| 'booting'
	| 'ready'
	| 'compiling'
	| 'transpiling'
	| 'running'
	| 'stopping'
	/** A write from the Contracts view is on its way to the chain. */
	| 'sending'
	/** `reset()`: the starting project, a fresh chain and no records, replacing what was saved. */
	| 'resetting'
	| 'failed';

/** What the session's chain offers the Contracts view: an EIP-1193-style `request`. */
export type ChainProvider = {request(args: {method: string; params?: unknown}): Promise<unknown>};

/** A page the transcript points to after its text, opened in a new tab. */
export type TranscriptLink = {href: string; label: string};

export type TranscriptLine = {seq: number; source: LogSource; text: string; at: number; link?: TranscriptLink};

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
	languageService: LanguageServiceState;
	/**
	 * Counts the artifact types the language service has been given (by the background compile or
	 * a Deploy's): the editor re-reads its diagnostics when it changes.
	 */
	artifactTypes: number;
	files: ProjectFiles;
	selected: string;
	/** The deployment store, by path: `deployments/playground/Counter.json`, `.chain`, ... */
	records: ProjectFiles;
	transcript: TranscriptLine[];
	diagnostics: Diagnostic[];
	blockNumber?: number;
	lastRun?: LastRun;
	/**
	 * The reader's named accounts, name to address, as the last run that loaded the config
	 * reported them (`RunOutcome.namedAccounts`). Undefined before any run: the config is user
	 * code, and only the runner evaluates it.
	 */
	namedAccounts?: Record<string, string>;
};

export type PlaygroundSession = Readable<PlaygroundState> & {
	start(): Promise<void>;
	deploy(): Promise<LastRun | undefined>;
	stop(): Promise<void>;
	edit(path: string, text: string): void;
	select(path: string): void;
	/**
	 * Back to a first visit, saved copies included: the starting project's files, a fresh chain at
	 * block 0 and no records. Only while `ready`; does nothing otherwise (as `deploy` does).
	 */
	reset(): Promise<void>;
	/**
	 * Open a shared link's files as `reset()` gives the starting project: `files` in place of the
	 * reader's, saved over them, on a fresh chain at block 0 with no records. Nothing runs until
	 * Deploy. Only while `ready`; does nothing otherwise.
	 */
	open(files: ProjectFiles): Promise<void>;
	/** The in-tab chain, for the Contracts view's reads, once it has started. */
	provider(): ChainProvider | undefined;
	/**
	 * Run `send` (a write) with the chain to itself: only while `ready`, in phase `sending`, and
	 * the block number is refreshed after. Rejects, sending nothing, when the session is busy.
	 */
	transact<T>(send: (provider: ChainProvider) => Promise<T>): Promise<T>;
	/** The TypeScript worker, for the editor's language-service extensions, once it is ready. */
	languageService(): Remote<TypeScriptWorkerApi> | undefined;
	dispose(): Promise<void>;
};

/** Long transcripts keep their tail: a reader scrolls back a few runs, not a thousand. */
const TRANSCRIPT_LIMIT = 2000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What a project opens on: its first deploy script. */
const firstSelected = (files: ProjectFiles) => Object.keys(files).find((p) => p.startsWith('deploy/')) ?? Object.keys(files)[0];

export function createPlaygroundSession(options: SessionOptions): PlaygroundSession {
	const files = options.files ?? startingProject();
	let state: PlaygroundState = {
		phase: 'idle',
		compiler: {status: 'loading', loaded: 0, total: options.compilerBytes},
		languageService: {status: 'off'},
		artifactTypes: 0,
		files,
		selected: firstSelected(files),
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
	function say(source: LogSource, text: string, link?: TranscriptLink) {
		const line: TranscriptLine = {seq: seq++, source, text, at: Date.now(), ...(link ? {link} : {})};
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
	let evmWorker: WorkerLike | undefined;
	let node: SlimNode | undefined;
	let startedAt = 0;

	/** The chain, in its own worker; `fresh` replaces what `chainDB` holds with a new chain. */
	async function startChain(fresh: boolean) {
		evmWorker = options.workers.evm();
		const evmOptions: EVMNodeOptions & {worker: WorkerLike} = {
			worker: evmWorker,
			chainId: CHAIN_ID,
			// so the Transactions view can replay an older transaction to find a revert's reason
			stateHistory: {blocks: STATE_HISTORY_BLOCKS},
			initialBalances: Object.fromEntries(TEST_ADDRESSES.map((a) => [a, INITIAL_BALANCE])),
			...(options.chainDB ? {indexedDB: options.chainDB} : {}),
			...(fresh ? {fresh} : {}),
		};
		node = await createWorkerNode(evmOptions as never);
	}

	// --- the editor's language service, and the artifact types it needs ---------------------------
	/** The `generated/artifacts/*.d.ts` of the last compile that succeeded. */
	let artifactTypes: ProjectFiles | undefined;

	async function startLanguageService() {
		set({languageService: {status: 'loading'}});
		try {
			const startedWith = state.files;
			const started = await typescript!.startLanguageService({...startedWith, ...artifactTypes});
			// What changed while it loaded: edits (which were not forwarded), a Reset (which drops the
			// files the reader added) and a compile's types.
			const gone = Object.keys(startedWith).filter((path) => !(path in state.files));
			if (gone.length > 0) await typescript!.removeFiles(gone);
			await typescript!.setFiles(state.files);
			if (artifactTypes) await typescript!.setArtifactTypes(artifactTypes);
			set((s) => ({
				languageService: {status: 'ready', readyMs: performance.now() - startedAt, loadMs: started.loadMs, createMs: started.createMs},
				artifactTypes: s.artifactTypes + (artifactTypes ? 1 : 0),
			}));
		} catch (error) {
			set({languageService: {status: 'failed', error: messageOf(error)}});
		}
	}

	function useArtifactTypes(types: ProjectFiles) {
		artifactTypes = types;
		if (state.languageService.status !== 'ready') return;
		void typescript!.setArtifactTypes(types);
		set((s) => ({artifactTypes: s.artifactTypes + 1}));
	}

	// One background compile at a time; an edit during one asks for another after it.
	let compiling: Promise<void> | undefined;
	let compileAgain = false;
	let compileTimer: ReturnType<typeof setTimeout> | undefined;

	function compileInBackground(): Promise<void> {
		if (compiling) {
			compileAgain = true;
			return compiling;
		}
		compiling = (async () => {
			try {
				await compilerLoaded;
				const compiled = await compile(state.files);
				// A contract with an error keeps the last types, rather than none while it is typed.
				if (compiled.ok) useArtifactTypes(compiled.types);
			} catch {
				// The compiler did not load or solc failed: Deploy reports it.
			}
		})().finally(() => {
			compiling = undefined;
			if (compileAgain) {
				compileAgain = false;
				void compileInBackground();
			}
		});
		return compiling;
	}

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

	/** `fresh` empties the deployment store (and its database) before the runner is ready. */
	async function startRunner(fresh = false): Promise<void> {
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
		const init: RunnerRequest = {type: 'init', provider: channel.port2, deploymentsDB: options.deploymentsDB, ...(fresh ? {fresh} : {})};
		worker.postMessage(init, [channel.port2]);
		runner = current;
		await ready;
	}

	// --- the saved project ------------------------------------------------------------------------
	let saved: SavedProject | undefined;

	/** The files and the selection the last session on `filesDB` left, before anything reads them. */
	async function openProject() {
		if (!options.filesDB) return;
		try {
			saved = await openSavedProject(options.filesDB, files);
		} catch (error) {
			// The project still works, from memory: losing the edits at a reload beats not starting.
			say('warning', `Your files could not be read from this browser's storage, and edits will not be kept: ${messageOf(error)}`);
			return;
		}
		const restored = saved.files;
		// A saved selection is a project file or a record (which the runner restores next).
		set({files: restored, selected: saved.selected ?? firstSelected(restored)});
	}

	// --- lifecycle --------------------------------------------------------------------------------
	async function start() {
		if (state.phase !== 'idle') return;
		set({phase: 'booting'});
		startedAt = performance.now();
		try {
			// First: the background compile and the language service read the files.
			await openProject();
			// The compiler first: it is the long download, and it loads while the rest boots. The
			// starting project is compiled as soon as it has, for the editor's artifact types.
			startCompiler();
			void compileInBackground();
			typescriptWorker = options.workers.typescript();
			typescript = wrap<TypeScriptWorkerApi>(typescriptWorker as unknown as Endpoint);
			await startChain(false);
			await startRunner();
			// A selected record that is no more (the records are restored by now): the first script.
			if (!(state.selected in state.files) && !(state.selected in state.records)) set({selected: firstSelected(state.files)});
			set({typescriptVersion: await typescript.version});
			await refreshBlockNumber();
			set({phase: 'ready'});
			// After the rest: a run does not need it, and the editor is usable without it.
			void startLanguageService();
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
		if (compiled.ok) useArtifactTypes(compiled.types);
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
		if (result.namedAccounts) set({namedAccounts: result.namedAccounts});
		const sent = result.requests.eth_sendRawTransaction ?? 0;
		const ms = performance.now() - t0;
		if (result.ok) {
			say(
				'success',
				sent === 0
					? `Done in ${ms.toFixed(0)} ms: nothing to send, everything is deployed already.`
					: `Done in ${ms.toFixed(0)} ms: ${sent} transaction${sent === 1 ? '' : 's'} sent.`,
			);
		} else if (result.error && looksLikeV1Script(result.error)) {
			// After rocketh's own error, which the runner has logged by now.
			say('playground', V1_SCRIPT_HINT, {href: MIGRATION_GUIDE_URL, label: MIGRATION_GUIDE_LABEL});
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

	/**
	 * Reset and opening a link: `next` in place of the files, saved over them, a fresh chain and
	 * no records. `done` is the transcript's line once it has, `failure` what a failure is called.
	 */
	async function replaceProject(next: ProjectFiles, done: string, failure: string) {
		if (state.phase !== 'ready' || !node || !runner) return;
		set({phase: 'resetting'});
		try {
			// The runner first: its provider is a port the old node serves.
			const ended = runner;
			runner = undefined;
			ended.worker.terminate();
			await ended.served.close().catch(() => {});
			await node.dispose().catch(() => {});
			evmWorker?.terminate();
			node = undefined;

			const previous = state.files;
			const selected = firstSelected(next);
			clearTimeout(compileTimer);
			saved?.reset(next, selected);
			set({files: next, selected, records: {}, diagnostics: [], lastRun: undefined, namedAccounts: undefined});
			// The language service and the artifact types: the new files, then their compile.
			if (state.languageService.status === 'ready') {
				const gone = Object.keys(previous).filter((path) => !(path in next));
				if (gone.length > 0) await typescript!.removeFiles(gone);
				await typescript!.setFiles(next);
				set((s) => ({artifactTypes: s.artifactTypes + 1}));
			}
			void compileInBackground();

			await startChain(true);
			await startRunner(true);
			await saved?.flush();
			await refreshBlockNumber();
			say('playground', done);
			set({phase: 'ready'});
		} catch (error) {
			set({phase: 'failed', error: messageOf(error)});
			say('error', `${failure}: ${messageOf(error)}`);
		}
	}

	const reset = () =>
		replaceProject(
			files,
			'Reset: the starting project, a new chain at block 0 and no deployment records. Your edits and the old chain are gone.',
			'The playground could not reset',
		);

	const open = (next: ProjectFiles) =>
		replaceProject(
			next,
			'Opened the shared project: its files, a new chain at block 0 and no deployment records. Nothing has run: press Deploy to run its scripts.',
			'The playground could not open the shared project',
		);

	function edit(path: string, text: string) {
		set((s) => ({files: {...s.files, [path]: text}}));
		saved?.write(path, text);
		// Forwarded at once, so the worker has this text before the editor asks for its lints.
		if (state.languageService.status === 'ready') void typescript!.setFiles({[path]: text});
		if (path.endsWith('.sol') && compilerWorker) {
			clearTimeout(compileTimer);
			compileTimer = setTimeout(() => void compileInBackground(), options.compileDebounceMs ?? 400);
		}
	}

	function select(path: string) {
		set({selected: path});
		saved?.select(path);
	}

	async function dispose() {
		clearTimeout(compileTimer);
		runner?.worker.terminate();
		await runner?.served.close().catch(() => {});
		compilerWorker?.terminate();
		typescriptWorker?.terminate();
		await node?.dispose().catch(() => {});
		// What was typed last reaches storage before the session lets go of it.
		await saved?.flush().catch(() => {});
		saved?.dispose();
		saved = undefined;
		runner = undefined;
		node = undefined;
		set({phase: 'idle'});
	}

	const languageService = () => (state.languageService.status === 'ready' ? typescript : undefined);

	const provider = (): ChainProvider | undefined => (node ? (node as unknown as ChainProvider) : undefined);

	async function transact<T>(send: (provider: ChainProvider) => Promise<T>): Promise<T> {
		if (state.phase !== 'ready' || !node) {
			throw new Error(`The chain is busy (${phaseLabel(state.phase).toLowerCase()}); nothing was sent.`);
		}
		set({phase: 'sending'});
		try {
			return await send(node as unknown as ChainProvider);
		} finally {
			await refreshBlockNumber().catch(() => {});
			// `dispose` may have run meanwhile; only a session still sending goes back to ready
			if ((state.phase as Phase) === 'sending') set({phase: 'ready'});
		}
	}

	return {subscribe: store.subscribe, start, deploy, stop, reset, open, edit, select, provider, transact, languageService, dispose};
}
