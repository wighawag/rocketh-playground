/**
 * The starting project, compiled, transpiled and run in node exactly as the workers do it in a
 * browser: the template's files unedited, the shipped soljson, TypeScript 6, webevm, @rocketh/web.
 */
import {chain, prepare, project, run, sent} from './helpers.js';
import {describe, it, expect, beforeEach} from 'vitest';
import {createVFSDeploymentStore} from '@rocketh/web';
import {privateKeyToAccount} from 'viem/accounts';
import {STARTING_PROJECT_PATHS, TEMPLATE_FILES, TEMPLATE_SOURCE, startingProject} from '../../../src/lib/playground/project/template.js';
import {TEST_ADDRESSES, TEST_KEYS} from '../../../src/lib/playground/runner/test-keys.js';

const RECORD = 'deployments/playground/Counter.json';
const CHAIN_FILE = 'deployments/playground/.chain';

describe('the starting project', () => {
	it('is the published template, unedited', () => {
		expect(TEMPLATE_SOURCE.package).toBe('hardhat-deploy');
		const files = startingProject();
		expect(Object.keys(files).sort()).toEqual([...STARTING_PROJECT_PATHS].sort());
		for (const path of STARTING_PROJECT_PATHS) expect(files[path]).toBe(TEMPLATE_FILES[path]);
		expect(files['rocketh/config.ts']).toContain("import * as unknownSignerExtension from '@rocketh/unknown-signer'");
	});

	it('labels its test keys with the addresses they sign for', () => {
		expect(TEST_KEYS.map((k) => privateKeyToAccount(k).address)).toEqual([...TEST_ADDRESSES]);
	});
});

describe('compile and transpile', () => {
	it('compiles Counter.sol and generates the artifacts the template imports', async () => {
		const {compiled, transpiled} = await prepare(project());
		expect(compiled.ok).toBe(true);
		expect(compiled.artifacts['generated/artifacts/index.js']).toContain("export {Artifact_Counter as Counter} from './Counter.js';");
		expect(transpiled.ok).toBe(true);
		// a type-only import is erased, so it is not something the runner has to provide
		expect(transpiled.imports['rocketh/config.ts']).not.toContain('rocketh/types');
		expect(transpiled.imports['rocketh/deploy.ts']).toEqual(
			expect.arrayContaining(['./config.js', '../generated/artifacts/index.js', 'rocketh']),
		);
	});

	it('reports a Solidity error with its file and line', async () => {
		const broken = TEMPLATE_FILES['contracts/Counter.sol'].replace('x++;', 'x++');
		const {compiled} = await prepare(project({'contracts/Counter.sol': broken}));
		expect(compiled.ok).toBe(false);
		const error = compiled.diagnostics.find((d) => d.severity === 'error');
		// solc reports a missing `;` at the token after it: `emit`, on the next line
		expect(error).toMatchObject({file: 'contracts/Counter.sol', line: 11, source: 'solc'});
		expect(error?.message).toContain("Expected ';'");
		expect(compiled.artifacts).toEqual({});
	});

	it('reports a TypeScript syntax error with its file and line', async () => {
		const {transpiled} = await prepare(
			project({'deploy/02_broken.ts': "import {deployScript} from '../rocketh/deploy.js';\n\nconst x = ;\n"}),
		);
		expect(transpiled.ok).toBe(false);
		expect(transpiled.diagnostics[0]).toMatchObject({file: 'deploy/02_broken.ts', line: 3, column: 11, source: 'typescript'});
	});
});

describe('a run', () => {
	let node: Awaited<ReturnType<typeof chain>>;
	let deploymentStore: ReturnType<typeof createVFSDeploymentStore>;
	beforeEach(async () => {
		node = await chain();
		deploymentStore = createVFSDeploymentStore();
	});
	const deps = () => ({provider: node as never, deploymentStore});

	it('deploys Counter with the template files unedited, and writes its record and .chain', async () => {
		const {outcome, transcript} = await run(project(), deps());
		expect(outcome.error).toBeUndefined();
		expect(outcome.ok).toBe(true);
		expect(sent(outcome.requests)).toBe(1);
		expect(deploymentStore.vfs.paths()).toEqual([CHAIN_FILE, RECORD]);
		const record = JSON.parse(deploymentStore.vfs.read(RECORD));
		expect(record.address).toBe(outcome.deployments.Counter);
		const code = (await node.request({method: 'eth_getCode', params: [record.address, 'latest']} as never)) as string;
		expect(code.length).toBeGreaterThan(2);
		expect(transcript).toContain('[rocketh] - Executing 01_deploy_counter.ts');
		expect(transcript.some((line) => line.includes('Deploying Counter'))).toBe(true);
	});

	it('sends nothing when nothing changed, and the transcript says so', async () => {
		await run(project(), deps());
		const {outcome, transcript} = await run(project(), deps());
		expect(outcome.ok).toBe(true);
		expect(sent(outcome.requests)).toBe(0);
		expect(transcript.some((line) => line.includes('reusing "Counter"'))).toBe(true);
	});

	it('redeploys an edited contract', async () => {
		const first = await run(project(), deps());
		const edited = TEMPLATE_FILES['contracts/Counter.sol'].replace('increment should be positive', 'the increment must be positive');
		const second = await run(project({'contracts/Counter.sol': edited}), deps());
		expect(sent(second.outcome.requests)).toBe(1);
		expect(second.outcome.deployments.Counter).not.toBe(first.outcome.deployments.Counter);
	});

	it('resolves viem subpaths', async () => {
		const {outcome, transcript} = await run(
			project({
				'deploy/02_log.ts':
					"import {deployScript} from '../rocketh/deploy.js';\nimport {privateKeyToAddress} from 'viem/accounts';\n\n" +
					"export default deployScript(async () => {\n\tconsole.log('from viem/accounts:', typeof privateKeyToAddress);\n}, {});\n",
			}),
			deps(),
		);
		expect(outcome.error).toBeUndefined();
		expect(transcript).toContain('[script] from viem/accounts: function');
	});

	it('refuses an unsupported import before any script runs, naming it and the list', async () => {
		const {outcome} = await run(
			project({
				'deploy/02_bad.ts':
					"import {deployScript} from '../rocketh/deploy.js';\nimport _ from 'lodash';\n\nexport default deployScript(async () => console.log(_), {});\n",
			}),
			deps(),
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.error?.name).toBe('UnsupportedImportError');
		expect(outcome.error?.message).toContain('deploy/02_bad.ts imports "lodash"');
		expect(outcome.error?.message).toContain('@rocketh/unknown-signer');
		expect(outcome.error?.message).toContain('viem/accounts');
		expect(outcome.requests).toEqual({});
		expect(deploymentStore.vfs.paths()).toEqual([]);
	});

	it('refuses an import of a file the project does not have', async () => {
		const {outcome} = await run(
			project({'deploy/02_bad.ts': "import {x} from './missing.js';\nexport default x;\n"}),
			deps(),
		);
		expect(outcome.error?.name).toBe('MissingFileError');
		expect(outcome.error?.message).toBe('deploy/02_bad.ts imports "./missing.js", and the project has no such file.');
	});

	it('reports a script that throws', async () => {
		const {outcome, transcript} = await run(
			project({
				'deploy/02_throws.ts':
					"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\tthrow new Error('failed on purpose');\n}, {});\n",
			}),
			deps(),
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.error?.message).toContain('failed on purpose');
		expect(transcript.at(-1)).toContain('failed on purpose');
	});

	it('gives a script that touches the page a ReferenceError', async () => {
		const {outcome} = await run(
			project({
				'deploy/02_page.ts':
					"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\twindow.location.href = 'https://example.com';\n}, {});\n",
			}),
			deps(),
		);
		expect(outcome.error?.name).toBe('ReferenceError');
		expect(outcome.error?.message).toBe('window is not defined');
	});

	it('reports a revert with its reason', async () => {
		const {outcome} = await run(
			project({
				'deploy/02_revert.ts':
					"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(\n\tasync ({execute, get, namedAccounts}) => {\n" +
					"\t\tawait execute(get('Counter'), {account: namedAccounts.deployer, functionName: 'incBy', args: [0n]});\n\t},\n\t{dependencies: ['Counter']},\n);\n",
			}),
			deps(),
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.error?.message).toContain('incBy: increment should be positive');
	});

	it('runs deployViaProxy and a guarded execute with the extensions rocketh/config.ts spreads', async () => {
		const config = TEMPLATE_FILES['rocketh/config.ts']
			.replace("import * as viemExtension from '@rocketh/viem';", "import * as viemExtension from '@rocketh/viem';\nimport * as proxyExtension from '@rocketh/proxy';")
			.replace('...viemExtension,', '...viemExtension,\n\t...proxyExtension,');
		expect(config).toContain('...proxyExtension,');
		const files = project({
			'rocketh/config.ts': config,
			'deploy/01_deploy_counter.ts':
				"import {deployScript, artifacts} from '../rocketh/deploy.js';\n\n" +
				'export default deployScript(\n\tasync ({deployViaProxy, execute, namedAccounts}) => {\n' +
				"\t\tconst counter = await deployViaProxy('Counter', {account: namedAccounts.deployer, artifact: artifacts.Counter}, {owner: namedAccounts.admin});\n" +
				"\t\tconst result = await execute(counter, {\n\t\t\taccount: namedAccounts.deployer,\n\t\t\tfunctionName: 'incBy',\n\t\t\targs: [5n],\n" +
				"\t\t\tguard: {kind: 'call', functionName: 'x', equals: 5n},\n\t\t});\n\t\tconsole.log('execute:', result.outcome);\n\t},\n" +
				"\t{tags: ['Counter']},\n);\n",
		});
		const first = await run(files, deps());
		expect(first.outcome.error).toBeUndefined();
		expect(first.transcript).toContain('[script] execute: sent');
		expect(Object.keys(first.outcome.deployments).sort()).toEqual(['Counter', 'Counter_Implementation', 'Counter_Proxy']);
		const second = await run(files, deps());
		expect(second.transcript).toContain('[script] execute: skipped');
		expect(sent(second.outcome.requests)).toBe(0);
	});

	it('runs deployViaRouter when rocketh/config.ts spreads @rocketh/router', async () => {
		const config = TEMPLATE_FILES['rocketh/config.ts']
			.replace("import * as viemExtension from '@rocketh/viem';", "import * as viemExtension from '@rocketh/viem';\nimport * as routerExtension from '@rocketh/router';")
			.replace('...viemExtension,', '...viemExtension,\n\t...routerExtension,');
		expect(config).toContain('...routerExtension,');
		const files = project({
			'rocketh/config.ts': config,
			'deploy/01_deploy_counter.ts':
				"import {deployScript, artifacts} from '../rocketh/deploy.js';\n\n" +
				'export default deployScript(\n\tasync ({deployViaRouter, execute, read, namedAccounts}) => {\n' +
				"\t\tconst counter = await deployViaRouter('Counter', {account: namedAccounts.deployer}, [{name: 'Counter', artifact: artifacts.Counter}]);\n" +
				"\t\tawait execute(counter, {account: namedAccounts.deployer, functionName: 'incBy', args: [3n]});\n" +
				"\t\tconsole.log('x:', await read(counter, {functionName: 'x'}));\n\t},\n" +
				"\t{tags: ['Counter']},\n);\n",
		});
		const {outcome, transcript} = await run(files, deps());
		expect(outcome.error).toBeUndefined();
		expect(outcome.ok).toBe(true);
		expect(Object.keys(outcome.deployments).sort()).toEqual(['Counter', 'Counter_Router', 'Counter_Router_Counter_Route']);
		expect(transcript).toContain('[script] x: 3n');
	});
});
