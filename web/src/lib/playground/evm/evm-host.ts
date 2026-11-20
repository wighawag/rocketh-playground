/**
 * The EVM worker's side: webevm's own worker api, with the persistence built HERE.
 *
 * `createWorkerNode` structured-clones the node's options into the worker, and a persistence
 * adapter is an object with methods, so it cannot cross. The page sends the IndexedDB database
 * NAME, and the adapter is built on the thread that uses it (the shape of template-commit-reveal's
 * `web/src/lib/offline-node-host.ts`). Everything else passes through to webevm unchanged, so the
 * proxy the page gets back is webevm's own `Required<SlimNode>` proxy, `serveOn` included: the
 * page asks the node to serve a MessagePort, and hands the other end to the runner.
 */
import {expose, type Endpoint} from 'comlink';
import {createIndexedDBPersistence, type NodeOptions} from 'webevm';
import {createNodeWorkerApi} from 'webevm/worker-host';

export type EVMNodeOptions = Omit<NodeOptions, 'persistence' | 'engine'> & {
	/** Persist the chain in the IndexedDB database of this name, inside the worker. */
	indexedDB?: string;
	/**
	 * Start from genesis, ignoring what `indexedDB` holds, and save that genesis over it before the
	 * node is handed back: the playground's Reset, so a reload after it opens the new chain too.
	 */
	fresh?: boolean;
};

export function evmNodeApi() {
	const api = createNodeWorkerApi();
	return {
		async createNode(options: EVMNodeOptions) {
			const {indexedDB, fresh, ...rest} = options;
			if (!indexedDB) return api.createNode(rest);
			const persistence = createIndexedDBPersistence({db: indexedDB});
			if (!fresh) return api.createNode({...rest, persistence});
			// webevm loads the saved state on creation; a fresh node is told there is none
			const node = await api.createNode({...rest, persistence: {load: async () => null, save: (state) => persistence.save(state)}});
			await persistence.save(await node.dumpState());
			return node;
		},
	};
}

/**
 * Expose the api on `endpoint` (the worker's own scope by default). Synchronously, with nothing
 * awaited first: webevm measured that a worker module awaiting before `expose` can lose the
 * page's first message (`webevm/worker-host`, `exposeNode`).
 */
export function exposeEVMNode(endpoint?: Endpoint): void {
	expose(evmNodeApi(), endpoint);
}
