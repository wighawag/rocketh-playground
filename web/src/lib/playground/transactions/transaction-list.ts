/**
 * The Transactions view's list, as a store: the in-tab chain's transactions, newest first,
 * decoded with the deployment records' ABIs (`./decode.ts`).
 *
 * jolly-roger's list (`web/src/routes/explorer/lib/stores/transactionList.ts`, 8a73e680) is not
 * copied: it re-scans the latest 100 blocks from scratch on every refresh and has no way to read
 * older ones. This store keeps its shape (summaries from the copied `blockScanner.ts`, each
 * transaction fetched once by hash, cached) and reads the chain incrementally, a page at a time.
 *
 * HOW IT LEARNS OF NEW BLOCKS: from the session's `blockNumber`, which the session refreshes
 * after it starts (a reload: the chain is persisted), after every run (stopped ones too) and
 * after every write from the Contracts view. Those are the only ways a block is mined in the tab,
 * so following that number misses nothing, costs nothing while the chain is idle (no polling),
 * and reads nothing while a run is sending (webevm's `onNewHead` would fire for each of a run's
 * blocks). A read is safe during a run anyway: webevm serialises requests. Nothing here writes.
 *
 * HOW FAR BACK IT READS: `pageBlocks` blocks below the head at first (20; with webevm's auto
 * mining a block holds one transaction, so about 20 transactions), then `older()` reads the next
 * `pageBlocks` below the oldest it has, down to block 1. Catching up with the head reads only
 * the new blocks; more than a page of them (a long Deploy) starts the list again from the head,
 * so no update reads more than `pageBlocks` blocks.
 *
 * It follows the session only while something subscribes (the view is shown); a view shown again
 * catches up from where it was. One list per session: `transactionListFor`.
 */
import {writable, type Readable} from 'svelte/store';
import {createPublicClient, custom, type PublicClient} from 'viem';
import {scanBlocksInBatches} from '../../../routes/explorer/lib/services/blockScanner.js';
import {inTabChain} from '../contracts/chain-calls.js';
import {contractsFromRecords} from '../contracts/records.js';
import {STATE_HISTORY_BLOCKS} from '../runner/compose-config.js';
import type {ProjectFiles} from '../project/template.js';
import type {ChainProvider} from '../session.js';
import {decodeRow, loadRow, type DecodeContext, type RawTransaction, type TransactionRow} from './decode.js';

export const PAGE_BLOCKS = 20;
/** Blocks fetched at once, as jolly-roger's list does. */
const BATCH_SIZE = 5;

/** What the list needs of the session. */
export type TransactionsSource = Readable<{blockNumber?: number; records: ProjectFiles; namedAccounts?: Record<string, string>}> & {
	provider(): ChainProvider | undefined;
};

export type TransactionListState = {
	rows: TransactionRow[];
	/** `loading` until the first page is read. */
	status: 'loading' | 'ready' | 'failed';
	error?: string;
	/** The head the list is current with. */
	head?: number;
	/** The oldest block read; `older()` reads the blocks below it. */
	oldestBlock?: number;
	hasOlder: boolean;
	loadingOlder: boolean;
};

export type TransactionList = Readable<TransactionListState> & {
	/** Read the next page of older blocks. */
	older(): Promise<void>;
};

const initial: TransactionListState = {rows: [], status: 'loading', hasOlder: false, loadingOlder: false};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const newestFirst = (a: TransactionRow, b: TransactionRow) => b.blockNumber - a.blockNumber || b.transactionIndex - a.transactionIndex;

export function createTransactionList(
	source: TransactionsSource,
	options: {pageBlocks?: number; /** The node's `stateHistory` window. */ stateHistoryBlocks?: number} = {},
): TransactionList {
	const pageBlocks = options.pageBlocks ?? PAGE_BLOCKS;
	const stateHistoryBlocks = options.stateHistoryBlocks ?? STATE_HISTORY_BLOCKS;
	let state = initial;
	let latest: {blockNumber?: number; records: ProjectFiles; namedAccounts?: Record<string, string>} = {records: {}};
	/** What the rows were decoded with, to decode them again when it changes. */
	let decodedWith: {records: ProjectFiles; namedAccounts?: Record<string, string>} | undefined;
	const raw = new Map<`0x${string}`, RawTransaction>();
	let client: {provider: ChainProvider; publicClient: PublicClient} | undefined;

	const store = writable(state, () => {
		const unsubscribe = source.subscribe((value) => {
			latest = value;
			enqueue(update);
		});
		return unsubscribe;
	});
	const set = (patch: Partial<TransactionListState>) => {
		state = {...state, ...patch};
		store.set(state);
	};

	// One job at a time: a page read and a catch-up never interleave.
	let queue: Promise<void> = Promise.resolve();
	function enqueue(job: () => Promise<void>): Promise<void> {
		queue = queue.then(job).catch((error) => set({status: 'failed', error: messageOf(error), loadingOlder: false}));
		return queue;
	}

	function publicClient(): PublicClient | undefined {
		const provider = source.provider();
		if (!provider) return undefined;
		if (client?.provider !== provider) {
			const transport = custom({request: (args: {method: string; params?: unknown}) => provider.request(args)}, {retryCount: 0});
			client = {provider, publicClient: createPublicClient({chain: inTabChain, transport}) as PublicClient};
		}
		return client.publicClient;
	}

	function context(publicClient: PublicClient, head: number): DecodeContext {
		return {publicClient, contracts: contractsFromRecords(latest.records), namedAccounts: latest.namedAccounts, head, stateHistoryBlocks};
	}

	/** The transactions of `numbers`, read and decoded; the ones already read are skipped. */
	async function read(publicClient: PublicClient, numbers: number[], head: number): Promise<TransactionRow[]> {
		if (numbers.length === 0) return [];
		const summaries = await scanBlocksInBatches(publicClient, numbers.map(BigInt), BATCH_SIZE);
		const rows: TransactionRow[] = [];
		for (const summary of summaries) {
			const hash = summary.hash as `0x${string}`;
			if (raw.has(hash)) continue;
			const tx = await publicClient.getTransaction({hash});
			const loaded = await loadRow(tx, summary.timestamp, context(publicClient, head));
			raw.set(hash, loaded.raw);
			rows.push(loaded.row);
		}
		return rows;
	}

	const range = (from: number, to: number) => Array.from({length: Math.max(0, from - to + 1)}, (_, i) => from - i);

	async function update() {
		const publicClient_ = publicClient();
		const head = latest.blockNumber;
		if (!publicClient_ || head === undefined) return;

		// the records or the names changed: what is already read is decoded again
		if (decodedWith && (decodedWith.records !== latest.records || decodedWith.namedAccounts !== latest.namedAccounts)) {
			const ctx = context(publicClient_, state.head ?? head);
			const rows = await Promise.all(state.rows.map((row) => decodeRow(raw.get(row.hash)!, ctx)));
			set({rows});
		}
		decodedWith = {records: latest.records, namedAccounts: latest.namedAccounts};
		if (head === state.head) return;

		const fresh = state.head === undefined || head < state.head || head - state.head > pageBlocks;
		if (fresh) {
			raw.clear();
			const oldest = Math.max(1, head - pageBlocks + 1);
			const rows = await read(publicClient_, range(head, oldest), head);
			set({rows: rows.sort(newestFirst), status: 'ready', error: undefined, head, oldestBlock: oldest, hasOlder: oldest > 1});
		} else {
			const rows = await read(publicClient_, range(head, state.head! + 1), head);
			set({rows: [...rows, ...state.rows].sort(newestFirst), status: 'ready', error: undefined, head});
		}
	}

	function older(): Promise<void> {
		return enqueue(async () => {
			const publicClient_ = publicClient();
			if (!publicClient_ || !state.hasOlder || state.oldestBlock === undefined || state.head === undefined) return;
			set({loadingOlder: true});
			const oldest = Math.max(1, state.oldestBlock - pageBlocks);
			const rows = await read(publicClient_, range(state.oldestBlock - 1, oldest), state.head);
			set({rows: [...state.rows, ...rows].sort(newestFirst), oldestBlock: oldest, hasOlder: oldest > 1, loadingOlder: false});
		});
	}

	return {subscribe: store.subscribe, older};
}

const lists = new WeakMap<TransactionsSource, TransactionList>();

/** The session's list, made on first use and kept, so a view shown again starts from it. */
export function transactionListFor(source: TransactionsSource): TransactionList {
	let list = lists.get(source);
	if (!list) {
		list = createTransactionList(source);
		lists.set(source, list);
	}
	return list;
}
