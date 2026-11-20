/**
 * A whole session, as the page runs it, with each worker's host served on a MessageChannel
 * instead of a worker: the same compiler host (on the shipped soljson), TypeScript host, EVM host
 * and runner host. IndexedDB is `fake-indexeddb`, so a second session on the same databases is
 * what a reload gets.
 */
import {nodeSoljson} from './helpers.js';
import 'fake-indexeddb/auto';
import {describe, it, expect, afterEach} from 'vitest';
import {get} from 'svelte/store';
import ts from 'typescript';
import {serveCompiler} from '../../../src/lib/playground/compiler/compiler-host.js';
import {exposeTypeScript} from '../../../src/lib/playground/typescript/typescript-host.js';
import {exposeEVMNode} from '../../../src/lib/playground/evm/evm-host.js';
import {serveRunner} from '../../../src/lib/playground/runner/runner-host.js';
import {createPlaygroundSession, type PlaygroundSession, type PlaygroundWorkers, type WorkerLike} from '../../../src/lib/playground/session.js';
import {startingProject, TEMPLATE_FILES} from '../../../src/lib/playground/project/template.js';
import {TEST_ADDRESSES} from '../../../src/lib/playground/runner/test-keys.js';
import {contractsFromRecords} from '../../../src/lib/playground/contracts/records.js';
import {writeFunction} from '../../../src/lib/playground/contracts/chain-calls.js';
import {collectDeclarations} from '../../../scripts/declarations.mjs';
import {BARE_MODULE_NAMES, TYPE_ONLY_MODULES} from '../../../src/lib/playground/runner/bare-modules.js';
import {projectCompilerOptions, type Declarations} from '../../../src/lib/playground/typescript/project-options.js';

const COMPILER_BYTES = 9169169;

/** One end of a channel as the page's worker handle; the host is served on the other end. */
function inProcess(serve: (port: MessagePort) => void): WorkerLike {
	const {port1, port2} = new MessageChannel();
	serve(port1);
	return {
		postMessage: (message, transfer) => port2.postMessage(message, transfer ?? []),
		addEventListener: (type, listener) => {
			if (type !== 'message') return; // a port never fires `error`
			port2.addEventListener('message', listener as never);
			port2.start();
		},
		terminate: () => {
			port1.close();
			port2.close();
		},
	};
}

let declarations: Declarations | undefined;
const loadDeclarations = async () =>
	(declarations ??= collectDeclarations({specifiers: [...BARE_MODULE_NAMES, ...TYPE_ONLY_MODULES], compilerOptions: projectCompilerOptions(ts)}));

const workers: PlaygroundWorkers = {
	typescript: () => inProcess((port) => exposeTypeScript(ts, loadDeclarations, port)),
	compiler: () =>
		inProcess((port) =>
			serveCompiler(port as never, async (_url, onProgress) => {
				const soljson = await nodeSoljson();
				onProgress(COMPILER_BYTES);
				return soljson;
			}),
		),
	evm: () => inProcess((port) => exposeEVMNode(port)),
	runner: () => inProcess((port) => serveRunner(port as never)),
};

const sessions: PlaygroundSession[] = [];
afterEach(async () => {
	for (const session of sessions.splice(0)) await session.dispose();
});

async function started(db: string) {
	const session = createPlaygroundSession({
		compileDebounceMs: 10,
		workers,
		soljsonURL: 'solc/soljson.js',
		compilerBytes: COMPILER_BYTES,
		chainDB: `${db}-chain`,
		deploymentsDB: `${db}-records`,
		filesDB: `${db}-files`,
	});
	sessions.push(session);
	await session.start();
	return session;
}

const lines = (session: PlaygroundSession) => get(session).transcript.map((l) => `[${l.source}] ${l.text}`);

describe('a playground session', () => {
	it('boots, deploys the starting project, and shows its records', async () => {
		const session = await started('a');
		const booted = get(session);
		expect(booted.phase).toBe('ready');
		expect(booted.typescriptVersion).toBe(ts.version);
		expect(booted.blockNumber).toBe(0);
		expect(booted.selected).toBe('deploy/01_deploy_counter.ts');

		const run = await session.deploy();
		expect(run).toMatchObject({outcome: 'deployed', stage: 'run', sent: 1});
		const state = get(session);
		expect(state.phase).toBe('ready');
		expect(state.compiler).toMatchObject({status: 'ready', loaded: COMPILER_BYTES, total: COMPILER_BYTES});
		expect(Object.keys(state.records).sort()).toEqual(['deployments/playground/.chain', 'deployments/playground/Counter.json']);
		expect(state.blockNumber).toBe(1);
		expect(lines(session)).toContain('[rocketh] - Executing 01_deploy_counter.ts');
		expect(lines(session).at(-1)).toMatch(/^\[success\] Done in \d+ ms: 1 transaction sent\.$/);

		const again = await session.deploy();
		expect(again).toMatchObject({outcome: 'deployed', sent: 0});
		expect(lines(session).at(-1)).toMatch(/nothing to send, everything is deployed already\.$/);
	});

	it('shows a Solidity error with its file and line, and sends nothing', async () => {
		const session = await started('b');
		session.edit('contracts/Counter.sol', TEMPLATE_FILES['contracts/Counter.sol'].replace('x++;', 'x++'));
		const run = await session.deploy();
		expect(run).toMatchObject({outcome: 'failed', stage: 'compile', sent: 0});
		expect(get(session).diagnostics[0]).toMatchObject({file: 'contracts/Counter.sol', line: 11, severity: 'error'});
		expect(lines(session)).toContain('[error] The contracts did not compile; nothing was sent.');
		expect(get(session).blockNumber).toBe(0);
	});

	it('shows a TypeScript syntax error with its file and line, and sends nothing', async () => {
		const session = await started('c');
		session.edit('deploy/01_deploy_counter.ts', `${TEMPLATE_FILES['deploy/01_deploy_counter.ts']}\nconst broken = ;\n`);
		const run = await session.deploy();
		expect(run).toMatchObject({outcome: 'failed', stage: 'transpile', sent: 0});
		expect(lines(session).some((l) => l.startsWith('[error] deploy/01_deploy_counter.ts:15:'))).toBe(true);
	});

	it('restores the chain and the records in a new session, which then sends nothing', async () => {
		const first = await started('d');
		await first.deploy();
		const address = JSON.parse(get(first).records['deployments/playground/Counter.json']).address;
		await first.dispose();

		const reloaded = await started('d');
		expect(get(reloaded).blockNumber).toBe(1);
		expect(JSON.parse(get(reloaded).records['deployments/playground/Counter.json']).address).toBe(address);
		expect(await reloaded.deploy()).toMatchObject({outcome: 'deployed', sent: 0});
	});

	it('starts a new session from the files and the selection saved by the last one, typed and compiled from them', async () => {
		const DEPLOY = 'deploy/01_deploy_counter.ts';
		const COUNTER = 'contracts/Counter.sol';
		const first = await started('h');
		// Counter takes a start value; the script passes a number where viem wants a bigint
		const counter = TEMPLATE_FILES[COUNTER].replace('uint public x;', 'uint public x;\n  constructor(uint start) { x = start; }');
		const script = TEMPLATE_FILES[DEPLOY].replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],');
		first.edit(COUNTER, counter);
		first.edit(DEPLOY, script);
		first.select(COUNTER);
		await first.dispose();

		const reloaded = await started('h');
		expect(get(reloaded).files).toEqual({...startingProject(), [COUNTER]: counter, [DEPLOY]: script});
		expect(get(reloaded).selected).toBe(COUNTER);
		// the language service has the saved script, and the background compile the saved contract
		await expect.poll(() => get(reloaded).languageService.status, {timeout: 20_000}).toBe('ready');
		const service = reloaded.languageService()!;
		await expect.poll(async () => (await service.diagnostics(DEPLOY)).map((d) => d.message), {timeout: 20_000}).toEqual([
			"Type 'number' is not assignable to type 'bigint'.",
		]);
		expect(await reloaded.deploy()).toMatchObject({outcome: 'deployed', sent: 1});
	});

	it('starts from the starting project on an empty files database', async () => {
		const session = await started('i');
		expect(get(session).files).toEqual(startingProject());
		expect(get(session).selected).toBe('deploy/01_deploy_counter.ts');
	});

	it('resets to the starting project on a fresh chain with no records, and a new session starts from that too', async () => {
		const DEPLOY = 'deploy/01_deploy_counter.ts';
		const COUNTER = 'contracts/Counter.sol';
		const session = await started('j');
		await session.deploy();
		expect(get(session).blockNumber).toBe(1);
		// edits the language service flags (a number where viem wants a bigint), a new file, another selection
		session.edit(COUNTER, TEMPLATE_FILES[COUNTER].replace('uint public x;', 'uint public x;\n  constructor(uint start) { x = start; }'));
		session.edit(DEPLOY, TEMPLATE_FILES[DEPLOY].replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],'));
		session.edit('deploy/02_more.ts', "import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {}, {});\n");
		session.select(COUNTER);
		await expect.poll(() => get(session).languageService.status, {timeout: 20_000}).toBe('ready');
		const service = session.languageService()!;
		await expect.poll(async () => (await service.diagnostics(DEPLOY)).map((d) => d.message), {timeout: 20_000}).toEqual([
			"Type 'number' is not assignable to type 'bigint'.",
		]);

		const phases: string[] = [];
		const unsubscribe = session.subscribe((s) => phases.push(s.phase));
		await session.reset();
		unsubscribe();
		expect(phases).toContain('resetting');
		const state = get(session);
		expect(state).toMatchObject({phase: 'ready', blockNumber: 0, records: {}, selected: DEPLOY, diagnostics: []});
		expect(state.files).toEqual(startingProject());
		expect(state.lastRun).toBeUndefined();
		expect(state.namedAccounts).toBeUndefined();
		expect(lines(session).at(-1)).toBe(
			'[playground] Reset: the starting project, a new chain at block 0 and no deployment records. Your edits and the old chain are gone.',
		);
		// the language service has the starting files again, typed with their artifact types
		await expect.poll(async () => (await service.diagnostics(DEPLOY)).map((d) => d.message), {timeout: 20_000}).toEqual([]);
		// the reset chain serves the Contracts view's reads
		expect(await session.provider()!.request({method: 'eth_blockNumber'})).toBe('0x0');

		expect(await session.deploy()).toMatchObject({outcome: 'deployed', sent: 1});
		expect(get(session).blockNumber).toBe(1);
		await session.reset();
		await session.dispose();

		// what was saved is the starting project, the fresh chain and no records
		const reloaded = await started('j');
		expect(get(reloaded)).toMatchObject({blockNumber: 0, records: {}, selected: DEPLOY});
		expect(get(reloaded).files).toEqual(startingProject());
		expect(await reloaded.deploy()).toMatchObject({outcome: 'deployed', sent: 1});
	});

	it('refuses to reset while a run is in progress, changing nothing', async () => {
		const session = await started('k');
		const wait = "import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\tconsole.log('waiting forever');\n\tawait new Promise(() => {});\n}, {});\n";
		session.edit('deploy/02_wait.ts', wait);
		const running = session.deploy();
		await expect.poll(() => lines(session).includes('[script] waiting forever')).toBe(true);
		await session.reset();
		expect(get(session).phase).toBe('running');
		expect(get(session).files['deploy/02_wait.ts']).toBe(wait);
		await session.stop();
		await running;
		expect(get(session).blockNumber).toBe(1);
		expect(get(session).files['deploy/02_wait.ts']).toBe(wait);
	});

	it('stops a run that never finishes, and the next run works on the same chain', async () => {
		const session = await started('e');
		await session.deploy();
		session.edit(
			'deploy/02_wait.ts',
			"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\tconsole.log('waiting forever');\n\tawait new Promise(() => {});\n}, {dependencies: ['Counter']});\n",
		);
		const running = session.deploy();
		await expect.poll(() => lines(session).includes('[script] waiting forever')).toBe(true);
		expect(get(session).phase).toBe('running');
		await session.stop();
		expect(await running).toMatchObject({outcome: 'stopped'});
		expect(get(session).phase).toBe('ready');
		expect(get(session).blockNumber).toBe(1);

		// the reader fixes the script
		session.edit(
			'deploy/02_wait.ts',
			"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {}, {});\n",
		);
		expect(await session.deploy()).toMatchObject({outcome: 'deployed', sent: 0});
	});

	it('reports the named accounts a run resolved, and gives a write the chain only while ready', async () => {
		const session = await started('g');
		expect(get(session).namedAccounts).toBeUndefined();
		await session.deploy();
		expect(get(session).namedAccounts).toEqual({deployer: TEST_ADDRESSES[0], admin: TEST_ADDRESSES[1]});

		const [counter] = contractsFromRecords(get(session).records);
		const inc = counter.writeFunctions.find((f) => f.name === 'inc')!;
		const phases: string[] = [];
		const unsubscribe = session.subscribe((s) => phases.push(s.phase));
		const outcome = await session.transact((provider) => writeFunction({provider, abiItem: inc, contract: counter, inputValues: {}, keyIndex: 1}));
		unsubscribe();
		expect(outcome).toMatchObject({status: 'success', from: TEST_ADDRESSES[1], blockNumber: 2n});
		expect(phases).toContain('sending');
		expect(get(session)).toMatchObject({phase: 'ready', blockNumber: 2});

		// during a run, a write is refused and sends nothing
		session.edit(
			'deploy/02_wait.ts',
			"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\tconsole.log('waiting forever');\n\tawait new Promise(() => {});\n}, {dependencies: ['Counter']});\n",
		);
		const running = session.deploy();
		await expect.poll(() => lines(session).includes('[script] waiting forever')).toBe(true);
		await expect(session.transact(async () => 'sent')).rejects.toThrow('The chain is busy (running the deploy scripts); nothing was sent.');
		await session.stop();
		await running;
		expect(get(session)).toMatchObject({phase: 'ready', blockNumber: 2});
		expect(await session.transact(async () => 'sent')).toBe('sent');
	});

	it('types the project before any Deploy, flags a wrong constructor argument, and still runs it', async () => {
		const session = await started('f');
		await expect.poll(() => get(session).languageService.status, {timeout: 20_000}).toBe('ready');
		const service = session.languageService()!;
		const DEPLOY = 'deploy/01_deploy_counter.ts';
		// the starting project, typed from the background compile's artifact types
		await expect.poll(() => get(session).artifactTypes).toBeGreaterThan(0);
		expect(await service.diagnostics(DEPLOY)).toEqual([]);

		// Counter takes a start value; the script passes a number where viem wants a bigint
		session.edit('contracts/Counter.sol', TEMPLATE_FILES['contracts/Counter.sol'].replace('uint public x;', 'uint public x;\n  constructor(uint start) { x = start; }'));
		session.edit(DEPLOY, TEMPLATE_FILES[DEPLOY].replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],'));
		await expect.poll(async () => (await service.diagnostics(DEPLOY)).map((d) => d.message), {timeout: 20_000}).toEqual([
			"Type 'number' is not assignable to type 'bigint'.",
		]);
		expect(get(session).blockNumber).toBe(0);

		const run = await session.deploy();
		expect(run).toMatchObject({outcome: 'deployed', stage: 'run', sent: 1});
	});
});
