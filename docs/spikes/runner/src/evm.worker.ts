/**
 * The EVM worker: webevm's own worker api, with its IndexedDB persistence built HERE, on the
 * thread that uses it, because an adapter is an object with methods and cannot be cloned in from
 * the page. The page sends the database name instead. (The same shape as template-commit-reveal's
 * `web/src/lib/offline-node-host.ts`.)
 *
 * The page drives it with `createWorkerNode` and asks it to `serveOn` a MessagePort whose other
 * end goes to the runner, so the runner's requests reach this worker directly.
 *
 * `expose` runs synchronously at module scope with nothing awaited first: webevm measured that a
 * worker module awaiting before it can lose the page's first message (`webevm/worker-host`).
 */
import {expose} from 'comlink';
import {createIndexedDBPersistence, type NodeOptions} from 'webevm';
import {createNodeWorkerApi} from 'webevm/worker-host';

export type EVMNodeOptions = Omit<NodeOptions, 'persistence' | 'engine'> & {indexedDB?: string};

const api = createNodeWorkerApi();

expose({
	createNode(options: EVMNodeOptions) {
		const {indexedDB, ...rest} = options;
		return api.createNode({
			...rest,
			...(indexedDB ? {persistence: createIndexedDBPersistence({db: indexedDB})} : {}),
		});
	},
});
