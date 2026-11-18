/**
 * The runner worker: runs the reader's transpiled deploy scripts through `@rocketh/web`.
 *
 * - its provider is `providerOverPort` on a port the EVM worker serves, so every request goes
 *   runner to EVM worker, and the page relays nothing;
 * - its deployment store is in IndexedDB, and every change to it is posted to the page;
 * - `captureConsole` and rocketh's own `named-logs` lines feed one log stream, posted to the page.
 *
 * Stop is the page terminating THIS worker. The chain lives in the EVM worker and is untouched.
 */
// FIRST, so the named-logs factory exists before rocketh's modules are evaluated (see the file).
import {setLogSink} from './log-hook.js';

import {providerOverPort} from '@eip-1193/over-port';
import {captureConsole, createLogStream, formatConsoleArguments} from '@rocketh/playground';
import * as rocketh from 'rocketh';
import * as rockethWeb from '@rocketh/web';
import * as rockethDeploy from '@rocketh/deploy';
import * as rockethProxy from '@rocketh/proxy';
import * as rockethDiamond from '@rocketh/diamond';
import * as rockethReadExecute from '@rocketh/read-execute';
import * as rockethViem from '@rocketh/viem';
import * as rockethSigner from '@rocketh/signer';
import * as rockethUnknownSigner from '@rocketh/unknown-signer';
import * as viem from 'viem';
import {createRegistry} from './registry.js';
import {CHAIN_ID, ENVIRONMENT, composeConfig} from './compose-config.js';
import type {RunnerReply, RunnerRequest} from './protocol.js';

/** What a project file may import by name. The spec's list, plus `@rocketh/unknown-signer`, which the template's own config spreads. */
const BARE = {
	rocketh,
	'@rocketh/deploy': rockethDeploy,
	'@rocketh/proxy': rockethProxy,
	'@rocketh/diamond': rockethDiamond,
	'@rocketh/read-execute': rockethReadExecute,
	'@rocketh/viem': rockethViem,
	'@rocketh/signer': rockethSigner,
	'@rocketh/unknown-signer': rockethUnknownSigner,
	'@rocketh/web': rockethWeb,
	viem,
};

const post = (reply: RunnerReply, transfer: Transferable[] = []) => self.postMessage(reply, transfer);

const logs = createLogStream();
logs.subscribe((change) => {
	if (change.type === 'append') post({type: 'log', entry: change.entry});
});
setLogSink((namespace, level, args) => {
	// `rocketh` is not one of @rocketh/playground's `LogSource`s, which has no name for the
	// library's own lines; the page tells them apart from what a script printed.
	const source = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'rocketh';
	logs.append(source as 'script', namespace === 'rocketh' ? formatConsoleArguments(args) : `${namespace}: ${formatConsoleArguments(args)}`);
});

type Provider = {request(args: {method: string; params?: unknown}): Promise<unknown>};
let provider: Provider | undefined;
let store: Awaited<ReturnType<typeof rockethWeb.createIndexedDBDeploymentStore>> | undefined;
/** Requests by method for the CURRENT run, so a run that sends nothing can be shown to. */
let counts: Record<string, number> = {};

async function init(port: MessagePort, db: string) {
	const overPort = providerOverPort(port);
	provider = {
		...overPort,
		request: (args: {method: string; params?: unknown}) => {
			counts[args.method] = (counts[args.method] ?? 0) + 1;
			return overPort.request(args as never);
		},
	};
	store = await rockethWeb.createIndexedDBDeploymentStore({db});
	store.vfs.subscribe((change) => {
		if (change.type === 'write') post({type: 'store', change: 'write', path: change.path, content: store!.vfs.read(change.path)});
		else if (change.type === 'restore') post({type: 'snapshot', files: store!.vfs.snapshot()});
		else post({type: 'store', change: change.type, path: change.path});
	});
	post({type: 'ready', files: store.vfs.snapshot()});
}

async function run(modules: Record<string, string>, scripts: string[]) {
	if (!provider || !store) throw new Error('the runner was not initialised');
	counts = {};
	const t0 = performance.now();
	const capture = captureConsole(logs);
	try {
		const registry = createRegistry(modules, BARE);
		const configModule = registry.load('rocketh/config.ts') as {config?: unknown; extensions?: unknown};
		if (!configModule.config || !configModule.extensions) {
			throw new Error('rocketh/config.ts must export `config` and `extensions`');
		}
		const moduleObjects = scripts.map((path) => {
			const exported = registry.load(path) as {default?: unknown};
			if (typeof exported.default !== 'function') {
				throw new Error(`${path} has no default export made with deployScript(...)`);
			}
			return {id: path.slice('deploy/'.length), module: exported.default};
		});
		const config = composeConfig(configModule.config as never, rockethSigner.privateKey);
		const {loadAndExecuteDeploymentsFromModules} = rockethWeb.setupEnvironment(
			config as never,
			configModule.extensions as never,
			{deploymentStore: store},
		);
		const env = await loadAndExecuteDeploymentsFromModules(moduleObjects as never, {
			provider: provider as never,
			environment: ENVIRONMENT,
			saveDeployments: true,
			askBeforeProceeding: false,
			// webevm has already mined by the time a send returns, and answers `evm_mine` with -32601.
			autoMine: false,
		} as never);
		const deployments = Object.fromEntries(
			Object.entries((env as {deployments: Record<string, unknown>}).deployments).map(([name, d]) => [name, (d as {address: string}).address]),
		);
		post({type: 'done', ms: performance.now() - t0, counts, deployments, chainId: CHAIN_ID});
	} finally {
		capture.release();
	}
}

self.onmessage = (event: MessageEvent<RunnerRequest>) => {
	const request = event.data;
	const task = request.type === 'init' ? init(request.port, request.db) : run(request.modules, request.scripts);
	task.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		logs.append('error', message);
		post({
			type: 'error',
			message,
			name: error instanceof Error ? error.name : undefined,
			stack: error instanceof Error ? error.stack : undefined,
			counts,
		});
	});
};
