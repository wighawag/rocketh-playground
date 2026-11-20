/**
 * The runner worker's side, on any port-like scope (the worker's own scope in a browser, one end
 * of a MessageChannel in a test). See `./protocol.ts` for the messages.
 *
 * One deployment store and one provider for the life of the runner. Stop is the page terminating
 * the runner and starting another, which re-opens the store from IndexedDB; the chain is in the
 * EVM worker and does not notice. Reset is the same restart with `fresh`, which empties the store.
 */
import {providerOverPort, type PortLike} from '@eip-1193/over-port';
import {createLogStream} from '@rocketh/playground/log';
import type {DeploymentStore} from '@rocketh/core/types';
import type {VFS} from '@rocketh/web';
import {BARE_MODULES} from './bare-modules.js';
import {runDeployScripts, type RequestProvider} from './run.js';
import type {RunnerReply, RunnerRequest} from './protocol.js';

type Scope = {
	postMessage(message: unknown): void;
	addEventListener(type: 'message', listener: (event: {data: unknown}) => void): void;
	start?: () => void;
};

export function serveRunner(scope: Scope): void {
	const post = (reply: RunnerReply) => scope.postMessage(reply);
	let provider: RequestProvider | undefined;
	let store: (DeploymentStore & {vfs: VFS}) | undefined;
	// Runs one at a time: the console capture and the log routing are per realm.
	let queue: Promise<unknown> = Promise.resolve();

	const logs = createLogStream();
	logs.subscribe((change) => {
		if (change.type === 'append') post({type: 'log', entry: change.entry});
	});

	async function init(request: Extract<RunnerRequest, {type: 'init'}>) {
		const web = await BARE_MODULES['@rocketh/web']();
		provider = providerOverPort(request.provider as unknown as PortLike) as unknown as RequestProvider;
		store = request.deploymentsDB
			? await web.createIndexedDBDeploymentStore({db: request.deploymentsDB})
			: web.createVFSDeploymentStore();
		const vfs = store.vfs;
		if (request.fresh) {
			vfs.restore({});
			await vfs.flush?.();
		}
		vfs.subscribe((change) => {
			if (change.type === 'write') post({type: 'store', change: 'write', path: change.path, content: vfs.read(change.path)});
			else if (change.type === 'restore') post({type: 'store', change: 'restore', files: vfs.snapshot()});
			else post({type: 'store', change: change.type, path: change.path});
		});
		post({type: 'ready', files: vfs.snapshot()});
	}

	scope.addEventListener('message', (event) => {
		const request = event.data as RunnerRequest;
		if (request.type === 'init') {
			init(request).catch((error: unknown) =>
				post({type: 'init-failed', message: error instanceof Error ? error.message : String(error)}),
			);
			return;
		}
		if (request.type === 'run') {
			queue = queue.then(async () => {
				if (!provider || !store) {
					post({
						type: 'done',
						id: request.id,
						outcome: {ok: false, error: {name: 'Error', message: 'the runner was not initialised'}, deployments: {}, requests: {}, ms: 0},
					});
					return;
				}
				const outcome = await runDeployScripts(
					{modules: request.modules, imports: request.imports},
					{provider, deploymentStore: store, logs},
				);
				post({type: 'done', id: request.id, outcome});
			});
		}
	});
	scope.start?.();
}
