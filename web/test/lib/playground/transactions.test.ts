/**
 * The Transactions view's logic in node: the in-tab chain's transactions, read with the copied
 * block scanner and decoded with the copied decoder and the deployment records' ABIs, against a
 * webevm node after a real compile and run of the starting project.
 */
import {chain, project, run, sent} from './helpers.js';
import {describe, it, expect, beforeAll} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import {createVFSDeploymentStore} from '@rocketh/web';
import {createWalletClient, custom, encodeFunctionData, type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {contractsFromRecords, type DeployedContract} from '../../../src/lib/playground/contracts/records.js';
import {inTabChain, writeFunction} from '../../../src/lib/playground/contracts/chain-calls.js';
import {createTransactionList, type TransactionListState, type TransactionsSource} from '../../../src/lib/playground/transactions/transaction-list.js';
import type {TransactionRow} from '../../../src/lib/playground/transactions/decode.js';
import {TEST_ADDRESSES, TEST_KEYS} from '../../../src/lib/playground/runner/test-keys.js';
import type {ProjectFiles} from '../../../src/lib/playground/project/template.js';

type Node = Awaited<ReturnType<typeof chain>>;

const UNKNOWN = '0x00000000000000000000000000000000000c0ffe' as const;

/** What the list reads of the session: its state, and the node. */
function sessionOf(node: Node, initial: {blockNumber?: number; records: ProjectFiles; namedAccounts?: Record<string, string>}) {
	const state = writable(initial);
	const source: TransactionsSource = {subscribe: state.subscribe, provider: () => node};
	return {source, state};
}

async function head(node: Node) {
	return Number(await node.request({method: 'eth_blockNumber'} as never));
}

/** The list's first state that is `done`; a failed list rejects. */
function until(list: Readable<TransactionListState>, done: (s: TransactionListState) => boolean): Promise<TransactionListState> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out: ${JSON.stringify(get(list), (_, v) => (typeof v === 'bigint' ? `${v}` : v))}`)), 20_000);
		let unsubscribe = () => {};
		unsubscribe = list.subscribe((s) => {
			if (s.status === 'failed') reject(new Error(s.error));
			if (done(s)) {
				clearTimeout(timer);
				queueMicrotask(() => unsubscribe());
				resolve(s);
			}
		});
	});
}

/** A raw transaction from the deployer, with an explicit gas limit: nothing is estimated, so a revert is mined. */
async function sendRaw(node: Node, to: `0x${string}`, data: `0x${string}`) {
	const wallet = createWalletClient({account: privateKeyToAccount(TEST_KEYS[0]), chain: inTabChain, transport: custom(node as never, {retryCount: 0})});
	return wallet.sendTransaction({to, data, gas: 200_000n});
}

const brief = (row: TransactionRow) => ({
	title: row.title,
	status: row.status,
	from: row.from.label,
	to: row.to?.label ?? row.to?.address ?? null,
	args: row.args?.map((a) => `${a.name}: ${a.value}`),
	events: row.events.map((e) => `${e.contract}.${e.name}(${e.args.map((a) => `${a.name}: ${a.value}`).join(', ')})`),
	revert: row.revert,
});

describe('the in-tab chain, decoded with the records', () => {
	let node: Node;
	let deploymentStore: ReturnType<typeof createVFSDeploymentStore>;
	let counter: DeployedContract;
	let namedAccounts: Record<string, string> | undefined;
	const hashes: Record<string, `0x${string}`> = {};

	beforeAll(async () => {
		node = await chain();
		deploymentStore = createVFSDeploymentStore();
		const {outcome} = await run(project(), {provider: node as never, deploymentStore});
		expect(outcome.ok).toBe(true);
		namedAccounts = outcome.namedAccounts;
		[counter] = contractsFromRecords(deploymentStore.vfs.snapshot());
		const write = (name: string, inputValues: Record<string, string>, keyIndex = 0) =>
			writeFunction({provider: node, abiItem: counter.writeFunctions.find((f) => f.name === name)!, contract: counter, inputValues, keyIndex});
		hashes.inc = (await write('inc', {})).hash;
		hashes.incBy5 = (await write('incBy', {by: '5'}, 1)).hash;
		hashes.incBy0 = await sendRaw(node, counter.address, encodeFunctionData({abi: counter.abi as Abi, functionName: 'incBy', args: [0n]}));
		hashes.unknown = await sendRaw(node, UNKNOWN, '0x12345678');
	}, 120_000);

	const records = () => deploymentStore.vfs.snapshot();

	it('lists every transaction newest first: the deployment, the calls with their events, a revert and a call to an unknown address', async () => {
		expect(await head(node)).toBe(5);
		const {source} = sessionOf(node, {blockNumber: 5, records: records(), namedAccounts});
		const list = createTransactionList(source);
		const s = await until(list, (s) => s.status === 'ready');
		expect(s).toMatchObject({head: 5, oldestBlock: 1, hasOlder: false});
		expect(s.rows.map((r) => [r.blockNumber, r.hash])).toEqual([
			[5, hashes.unknown],
			[4, hashes.incBy0],
			[3, hashes.incBy5],
			[2, hashes.inc],
			[1, counter.transactionHash],
		]);
		expect(s.rows.map(brief)).toEqual([
			{title: 'Call to an unknown contract', status: 'success', from: 'deployer', to: UNKNOWN, args: undefined, events: [], revert: undefined},
			{title: 'Counter.incBy', status: 'failed', from: 'deployer', to: 'Counter', args: ['by: 0'], events: [], revert: 'incBy: increment should be positive'},
			{title: 'Counter.incBy', status: 'success', from: 'admin', to: 'Counter', args: ['by: 5'], events: ['Counter.Increment(by: 5)'], revert: undefined},
			{title: 'Counter.inc', status: 'success', from: 'deployer', to: 'Counter', args: [], events: ['Counter.Increment(by: 1)'], revert: undefined},
			{title: 'Deploy Counter', status: 'success', from: 'deployer', to: null, args: [], events: [], revert: undefined},
		]);
		expect(s.rows[0].selector).toBe('0x12345678');
		expect(s.rows[0].kind).toBe('undecoded');
		expect(s.rows[4]).toMatchObject({kind: 'deployment', created: {address: counter.address, label: 'Counter'}});
	});

	it('follows the head: a write appears once the session reads the new block, and a Deploy that sends nothing adds nothing', async () => {
		const session = sessionOf(node, {blockNumber: await head(node), records: records(), namedAccounts});
		const list = createTransactionList(session.source);
		const stop = list.subscribe(() => {});
		await until(list, (s) => s.status === 'ready' && s.rows.length === 5);

		const inc = await writeFunction({provider: node, abiItem: counter.writeFunctions.find((f) => f.name === 'inc')!, contract: counter, inputValues: {}, keyIndex: 0});
		session.state.update((s) => ({...s, blockNumber: Number(inc.blockNumber)}));
		const s = await until(list, (s) => s.head === 6);
		expect(s.rows.length).toBe(6);
		expect(brief(s.rows[0])).toMatchObject({title: 'Counter.inc', from: 'deployer', events: ['Counter.Increment(by: 1)']});

		const {outcome} = await run(project(), {provider: node as never, deploymentStore});
		expect(sent(outcome.requests)).toBe(0);
		session.state.update((s) => ({...s, blockNumber: 6, records: records(), namedAccounts: outcome.namedAccounts}));
		await new Promise((r) => setTimeout(r, 50));
		expect(get(list).rows.length).toBe(6);
		stop();
	});

	it('reads a page of blocks at a time, and pages back to block 1', async () => {
		const {source} = sessionOf(node, {blockNumber: await head(node), records: records(), namedAccounts});
		const list = createTransactionList(source, {pageBlocks: 2});
		const stop = list.subscribe(() => {});
		let s = await until(list, (s) => s.status === 'ready');
		expect(s.rows.map((r) => r.blockNumber)).toEqual([6, 5]);
		expect(s).toMatchObject({oldestBlock: 5, hasOlder: true});
		await list.older();
		await list.older();
		s = get(list);
		expect(s.rows.map((r) => r.blockNumber)).toEqual([6, 5, 4, 3, 2, 1]);
		expect(s).toMatchObject({oldestBlock: 1, hasOlder: false});
		stop();
	});

	it('decodes an address with the record that holds it now: after a redeploy, the old one is shown undecoded', async () => {
		const session = sessionOf(node, {blockNumber: await head(node), records: records(), namedAccounts});
		const list = createTransactionList(session.source);
		const stop = list.subscribe(() => {});
		await until(list, (s) => s.status === 'ready');
		const moved = {...records()};
		const path = 'deployments/playground/Counter.json';
		moved[path] = JSON.stringify({...JSON.parse(moved[path]), address: UNKNOWN, transaction: {hash: `0x${'ab'.repeat(32)}`}});
		session.state.update((s) => ({...s, records: moved}));
		const s = await until(list, (s) => s.rows.every((r) => r.title !== 'Counter.inc'));
		const inc = s.rows.find((r) => r.hash === hashes.inc)!;
		expect(brief(inc)).toMatchObject({title: 'Call to an unknown contract', to: counter.address, events: []});
		expect(inc.undecodedEvents).toBe(1);
		expect(s.rows.find((r) => r.hash === counter.transactionHash)).toMatchObject({kind: 'creation', title: 'Contract creation'});
		// a record that still holds the old address (saved under another name) decodes it
		const kept = {...moved, 'deployments/playground/OldCounter.json': records()[path]};
		session.state.update((s) => ({...s, records: kept}));
		const again = await until(list, (s) => s.rows.some((r) => r.title === 'OldCounter.inc'));
		expect(brief(again.rows.find((r) => r.hash === hashes.inc)!).events).toEqual(['OldCounter.Increment(by: 1)']);
		stop();
	});
});

describe('a revert older than the state the chain keeps', () => {
	it('says its reason is no longer available', async () => {
		const node = await chain({stateHistory: {blocks: 1}});
		const deploymentStore = createVFSDeploymentStore();
		const {outcome} = await run(project(), {provider: node as never, deploymentStore});
		expect(outcome.ok).toBe(true);
		const [counter] = contractsFromRecords(deploymentStore.vfs.snapshot());
		const reverted = await sendRaw(node, counter.address, encodeFunctionData({abi: counter.abi as Abi, functionName: 'incBy', args: [0n]}));
		await sendRaw(node, UNKNOWN, '0x');
		await sendRaw(node, UNKNOWN, '0x');
		const {source} = sessionOf(node, {blockNumber: await head(node), records: deploymentStore.vfs.snapshot(), namedAccounts: outcome.namedAccounts});
		const s = await until(createTransactionList(source, {stateHistoryBlocks: 1}), (s) => s.status === 'ready');
		expect(s.rows.map((r) => r.title)).toEqual(['Transfer', 'Transfer', 'Counter.incBy', 'Deploy Counter']);
		expect(s.rows.find((r) => r.hash === reverted)!.revert).toBe(
			'the reason is no longer available: the chain keeps the state of its last 1 blocks, and this is block 2 of 4',
		);
	}, 60_000);
});
