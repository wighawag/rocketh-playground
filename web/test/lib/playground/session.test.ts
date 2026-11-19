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
import {TEMPLATE_FILES} from '../../../src/lib/playground/project/template.js';
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
