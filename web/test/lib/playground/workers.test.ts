/**
 * The EVM worker and the runner worker, each served on one end of a MessageChannel instead of a
 * worker's scope, and driven as the page drives them: the page creates the node with
 * `createWorkerNode`, asks it to serve a port, and hands the other end to the runner, whose
 * requests then reach the node without the page in between. IndexedDB is `fake-indexeddb`.
 */
import './helpers.js';
import 'fake-indexeddb/auto';
import {describe, it, expect, afterEach} from 'vitest';
import {createWorkerNode} from 'webevm/worker-client';
import type {SlimNode} from 'webevm';
import {exposeEVMNode, type EVMNodeOptions} from '../../../src/lib/playground/evm/evm-host.js';
import {serveRunner} from '../../../src/lib/playground/runner/runner-host.js';
import type {RunnerReply} from '../../../src/lib/playground/runner/protocol.js';
import {CHAIN_ID} from '../../../src/lib/playground/runner/compose-config.js';
import {INITIAL_BALANCE, TEST_ADDRESSES} from '../../../src/lib/playground/runner/test-keys.js';
import {prepare, project, sent} from './helpers.js';

const open: {close(): void}[] = [];
afterEach(() => {
	for (const port of open.splice(0)) port.close();
});

function channel() {
	const c = new MessageChannel();
	open.push(c.port1, c.port2);
	return c;
}

/** The EVM "worker": the host on one end, `createWorkerNode` on the other. */
async function evmWorker(db: string): Promise<SlimNode> {
	const {port1, port2} = channel();
	exposeEVMNode(port1);
	const worker = Object.assign(port2, {terminate: () => port2.close()});
	return createWorkerNode({
		worker: worker as unknown as Worker,
		chainId: CHAIN_ID,
		initialBalances: Object.fromEntries(TEST_ADDRESSES.map((a) => [a, INITIAL_BALANCE])),
		indexedDB: db,
	} as EVMNodeOptions as never);
}

/** The runner "worker", given a port the node serves. */
async function runnerWorker(node: SlimNode, deploymentsDB: string) {
	const {port1: runnerScope, port2: page} = channel();
	serveRunner(runnerScope as never);
	const provider = channel();
	const served = await node.serveOn(provider.port1);
	const replies: RunnerReply[] = [];
	const waiters: ((reply: RunnerReply) => void)[] = [];
	page.addEventListener('message', (event) => {
		const reply = event.data as RunnerReply;
		replies.push(reply);
		for (const waiter of waiters.splice(0)) waiter(reply);
	});
	page.start();
	const next = (type: RunnerReply['type']) =>
		new Promise<RunnerReply>((resolve) => {
			const found = replies.find((r) => r.type === type);
			if (found) {
				replies.splice(replies.indexOf(found), 1);
				return resolve(found);
			}
			const wait = (reply: RunnerReply) => {
				if (reply.type === type) {
					replies.splice(replies.indexOf(reply), 1);
					resolve(reply);
				} else waiters.push(wait);
			};
			waiters.push(wait);
		});
	page.postMessage({type: 'init', provider: provider.port2, deploymentsDB}, [provider.port2]);
	const ready = (await next('ready')) as Extract<RunnerReply, {type: 'ready'}>;
	let id = 0;
	return {
		files: ready.files,
		replies,
		served,
		async run(files = project()) {
			const {transpiled} = await prepare(files);
			const runId = ++id;
			page.postMessage({type: 'run', id: runId, modules: transpiled.modules, imports: transpiled.imports});
			return ((await next('done')) as Extract<RunnerReply, {type: 'done'}>).outcome;
		},
	};
}

const blockNumber = async (node: SlimNode) => Number(await node.request({method: 'eth_blockNumber'} as never));

describe('the four-worker protocol, over MessageChannels', () => {
	it('runs the starting project through a port the EVM worker serves, and posts the store changes', async () => {
		const node = await evmWorker('chain-a');
		const runner = await runnerWorker(node, 'records-a');
		expect(runner.files).toEqual({});
		const outcome = await runner.run();
		expect(outcome.error).toBeUndefined();
		expect(sent(outcome.requests)).toBe(1);
		const writes = runner.replies.filter((r) => r.type === 'store' && r.change === 'write').map((r) => (r as {path: string}).path);
		expect(writes).toEqual(expect.arrayContaining(['deployments/playground/.chain', 'deployments/playground/Counter.json']));
		const logs = runner.replies.filter((r) => r.type === 'log').map((r) => (r as {entry: {text: string}}).entry.text);
		expect(logs).toContain('- Executing 01_deploy_counter.ts');
		expect(await blockNumber(node)).toBe(1);
		await runner.served.close();
		await node.dispose();
	});

	it('restores the chain and the records from IndexedDB, and a run then sends nothing', async () => {
		const first = await evmWorker('chain-b');
		const before = await runnerWorker(first, 'records-b');
		const deployed = await before.run();
		const address = deployed.deployments.Counter;
		await before.served.close();
		await first.dispose();

		// a reload: a new node and a new runner on the same databases
		const node = await evmWorker('chain-b');
		expect(await blockNumber(node)).toBe(1);
		const code = (await node.request({method: 'eth_getCode', params: [address, 'latest']} as never)) as string;
		expect(code.length).toBeGreaterThan(2);
		const runner = await runnerWorker(node, 'records-b');
		expect(JSON.parse(runner.files['deployments/playground/Counter.json']).address).toBe(address);
		const again = await runner.run();
		expect(again.error).toBeUndefined();
		expect(sent(again.requests)).toBe(0);
		expect(await blockNumber(node)).toBe(1);
		await runner.served.close();
		await node.dispose();
	});

	it('a new runner on the same chain carries on, as after Stop', async () => {
		const node = await evmWorker('chain-c');
		const stopped = await runnerWorker(node, 'records-c');
		await stopped.run();
		// Stop: the page terminates the runner and closes the port it was served; the chain stays
		await stopped.served.close();
		const runner = await runnerWorker(node, 'records-c');
		const outcome = await runner.run();
		expect(outcome.error).toBeUndefined();
		expect(sent(outcome.requests)).toBe(0);
		await runner.served.close();
		await node.dispose();
	});
});
