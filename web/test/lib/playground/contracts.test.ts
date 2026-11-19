/**
 * The Contracts view's logic in node: the input conversion and validation copied from jolly-roger,
 * the contract list built from deployment records, the account picker, and reads and writes
 * against a webevm node, with the record a real compile and run of the starting project wrote.
 */
import {chain, project, run, sent} from './helpers.js';
import {describe, it, expect, beforeAll} from 'vitest';
import {createVFSDeploymentStore} from '@rocketh/web';
import {ContractFunctionRevertedError, encodeErrorResult, type Abi, type AbiFunction} from 'viem';
import {
	convertInputValues,
	getFunctionSignature,
	getInputKey,
	parseIntegerInput,
	validateInputValue,
	formatOutputJSON,
} from '../../../src/routes/contracts/lib/utils.js';
import {syncInputErrors} from '../../../src/routes/contracts/lib/input-errors.js';
import {contractsFromRecords, type DeployedContract} from '../../../src/lib/playground/contracts/records.js';
import {signingAccounts} from '../../../src/lib/playground/contracts/accounts.js';
import {callErrorMessage, readFunction, writeFunction} from '../../../src/lib/playground/contracts/chain-calls.js';
import {createFunctionCall, type ContractsChain} from '../../../src/lib/playground/contracts/function-call.js';
import {TEST_ADDRESSES} from '../../../src/lib/playground/runner/test-keys.js';
import {get} from 'svelte/store';

const fn = (inputs: AbiFunction['inputs'], name = 'f'): AbiFunction => ({type: 'function', name, inputs, outputs: [], stateMutability: 'nonpayable'});

describe('input conversion and validation (copied from jolly-roger)', () => {
	it('converts each input by its Solidity type, keyed by name or by index', () => {
		const inputs = [
			{name: 'to', type: 'address'},
			{name: 'amount', type: 'uint256'},
			{name: '', type: 'int8'},
			{name: 'flag', type: 'bool'},
			{name: 'ids', type: 'uint16[]'},
			{name: 'pair', type: 'tuple', components: [{name: 'a', type: 'uint8'}, {name: 'b', type: 'string'}]},
		] as const;
		expect(getInputKey(inputs[2], 2)).toBe('arg2');
		const args = convertInputValues(inputs, {
			to: TEST_ADDRESSES[1],
			amount: '0x10',
			arg2: '-0x7f',
			flag: 'true',
			ids: '1, 2,3',
			pair: '{"a": "7", "b": "hi"}',
		});
		expect(args).toEqual([TEST_ADDRESSES[1], 16n, -127n, true, [1n, 2n, 3n], {a: 7n, b: 'hi'}]);
		expect(parseIntegerInput(' -12 ')).toBe(-12n);
	});

	it('rejects what the type cannot hold, before anything is sent', () => {
		expect(validateInputValue('uint256', '-1')).toEqual({valid: false, error: 'uint256 cannot be negative'});
		expect(validateInputValue('uint8', '256')).toEqual({valid: false, error: 'Exceeds the maximum for uint8'});
		expect(validateInputValue('int8', '-129').valid).toBe(false);
		expect(validateInputValue('uint256', '1.5').valid).toBe(false);
		expect(validateInputValue('address', '0x1234').valid).toBe(false);
		expect(validateInputValue('bytes32', 'zz').valid).toBe(false);
		expect(validateInputValue('uint256', '').valid).toBe(true);
	});

	it('keeps each input error in the form state, and clears it once fixed', () => {
		const inputs = fn([{name: 'by', type: 'uint256'}, {name: 'to', type: 'address'}]).inputs;
		const errors: Record<string, string> = {};
		syncInputErrors(inputs, {by: '-1', to: 'nope'}, errors);
		expect(errors).toEqual({by: 'uint256 cannot be negative', to: 'Invalid address format (must be 0x...)'});
		syncInputErrors(inputs, {by: '1', to: TEST_ADDRESSES[0]}, errors);
		expect(errors).toEqual({});
	});

	it('names an overload by its full signature, and prints a result with its bigints', () => {
		expect(getFunctionSignature(fn([{name: 'p', type: 'tuple[]', components: [{name: 'a', type: 'address'}]}], 'g'))).toBe('g((address)[])');
		expect(formatOutputJSON([1n, 'x'])).toBe('[\n  "1",\n  "x"\n]');
	});
});

describe('a revert, in one line', () => {
	const abi = [
		{type: 'error', name: 'TooSmall', inputs: [{name: 'given', type: 'uint256'}, {name: 'who', type: 'address'}]},
	] as const satisfies Abi;
	const reverted = (data: `0x${string}`, errorAbi: Abi = abi) => new ContractFunctionRevertedError({abi: errorAbi, data, functionName: 'f'});

	it('names a custom error with its arguments', () => {
		const data = encodeErrorResult({abi, errorName: 'TooSmall', args: [3n, TEST_ADDRESSES[1]]});
		expect(callErrorMessage(reverted(data))).toBe(`reverted: TooSmall(3, "${TEST_ADDRESSES[1]}")`);
	});

	it('says when the error is not in the ABI, and when there is no reason at all', () => {
		const data = encodeErrorResult({abi, errorName: 'TooSmall', args: [3n, TEST_ADDRESSES[1]]});
		expect(callErrorMessage(reverted(data, []))).toMatch(/^reverted with an error the ABI does not declare \(0x[0-9a-f]{8}\)$/);
		expect(callErrorMessage(reverted('0x'))).toBe('reverted, with no reason given');
	});
});

describe('the contract list', () => {
	it('has one entry per deployment record, and leaves out rocketh files and broken records', () => {
		const abi = [
			{type: 'function', name: 'x', inputs: [], outputs: [{name: '', type: 'uint256'}], stateMutability: 'view'},
			{type: 'function', name: 'inc', inputs: [], outputs: [], stateMutability: 'nonpayable'},
			{type: 'event', name: 'Increment', inputs: [], anonymous: false},
		];
		const contracts = contractsFromRecords({
			'deployments/playground/Zeta.json': JSON.stringify({address: TEST_ADDRESSES[2], abi}),
			'deployments/playground/Alpha.json': JSON.stringify({address: TEST_ADDRESSES[3], abi: []}),
			'deployments/playground/.chain': JSON.stringify({chainId: '31337'}),
			'deployments/playground/.migrations.json': '{}',
			'deployments/playground/Broken.json': '{not json',
			'deployments/playground/NoAddress.json': JSON.stringify({abi}),
			'deployments/other/Elsewhere.json': JSON.stringify({address: TEST_ADDRESSES[4], abi}),
		});
		expect(contracts.map((c) => [c.name, c.address])).toEqual([
			['Alpha', TEST_ADDRESSES[3]],
			['Zeta', TEST_ADDRESSES[2]],
		]);
		expect(contracts[1].viewFunctions.map((f) => f.name)).toEqual(['x']);
		expect(contracts[1].writeFunctions.map((f) => f.name)).toEqual(['inc']);
	});
});

describe('the account picker', () => {
	it('labels the test accounts by index before any run', () => {
		const accounts = signingAccounts(undefined);
		expect(accounts.map((a) => a.label)).toEqual(TEST_ADDRESSES.map((_, i) => `account ${i}`));
		expect(accounts[0]).toEqual({label: 'account 0', address: TEST_ADDRESSES[0], keyIndex: 0});
	});

	it('puts the deployer first, then the other named accounts, then the rest', () => {
		const accounts = signingAccounts({admin: TEST_ADDRESSES[1].toLowerCase(), deployer: TEST_ADDRESSES[2], owner: TEST_ADDRESSES[2], safe: '0x000000000000000000000000000000000000dEaD'});
		expect(accounts.map((a) => [a.label, a.keyIndex])).toEqual([
			['deployer, owner', 2],
			['admin', 1],
			['account 0', 0],
			['account 3', 3],
			['account 4', 4],
		]);
		expect(accounts[1].address).toBe(TEST_ADDRESSES[1]);
	});
});

describe('reading and calling a deployed contract', () => {
	let node: Awaited<ReturnType<typeof chain>>;
	let deploymentStore: ReturnType<typeof createVFSDeploymentStore>;
	let counter: DeployedContract;
	let namedAccounts: Record<string, string> | undefined;
	const deps = () => ({provider: node as never, deploymentStore});
	const item = (name: string) => [...counter.viewFunctions, ...counter.writeFunctions].find((f) => f.name === name)!;
	const blockNumber = async () => Number(await node.request({method: 'eth_blockNumber'} as never));

	beforeAll(async () => {
		node = await chain();
		deploymentStore = createVFSDeploymentStore();
		const {outcome} = await run(project(), deps());
		expect(outcome.ok).toBe(true);
		namedAccounts = outcome.namedAccounts;
		[counter] = contractsFromRecords(deploymentStore.vfs.snapshot());
	});

	it('reports the named accounts the run resolved', () => {
		expect(namedAccounts).toEqual({deployer: TEST_ADDRESSES[0], admin: TEST_ADDRESSES[1]});
		expect(counter.name).toBe('Counter');
		expect(counter.viewFunctions.map((f) => f.name)).toEqual(['x']);
		expect(counter.writeFunctions.map((f) => f.name).sort()).toEqual(['inc', 'incBy']);
	});

	it('reports the named accounts of a run whose script failed after the config loaded', async () => {
		const {outcome} = await run(
			project({
				'deploy/02_throws.ts':
					"import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async () => {\n\tthrow new Error('failed on purpose');\n}, {});\n",
			}),
			{provider: (await chain()) as never, deploymentStore: createVFSDeploymentStore()},
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.namedAccounts).toEqual({deployer: TEST_ADDRESSES[0], admin: TEST_ADDRESSES[1]});
	});

	it('reads x, sends inc() from the deployer, mined at once, and reads x as 1', async () => {
		expect(await readFunction({provider: node, abiItem: item('x'), contract: counter, inputValues: {}})).toBe(0n);
		const before = await blockNumber();
		const accounts = signingAccounts(namedAccounts);
		expect(accounts[0].label).toBe('deployer');
		const outcome = await writeFunction({provider: node, abiItem: item('inc'), contract: counter, inputValues: {}, keyIndex: accounts[0].keyIndex});
		expect(outcome).toMatchObject({status: 'success', from: TEST_ADDRESSES[0], blockNumber: BigInt(before + 1)});
		expect(outcome.hash).toMatch(/^0x[0-9a-f]{64}$/);
		expect(await blockNumber()).toBe(before + 1);
		expect(await readFunction({provider: node, abiItem: item('x'), contract: counter, inputValues: {}})).toBe(1n);
	});

	it('shows the reason of a call that reverts, and sends nothing', async () => {
		const before = await blockNumber();
		const error = await writeFunction({provider: node, abiItem: item('incBy'), contract: counter, inputValues: {by: '0'}, keyIndex: 0}).catch((e) => e);
		expect(callErrorMessage(error)).toBe('reverted: incBy: increment should be positive');
		expect(await blockNumber()).toBe(before);
	});

	it('sends from another named account', async () => {
		const admin = signingAccounts(namedAccounts).find((a) => a.label === 'admin')!;
		const outcome = await writeFunction({provider: node, abiItem: item('incBy'), contract: counter, inputValues: {by: '5'}, keyIndex: admin.keyIndex});
		expect(outcome.from).toBe(TEST_ADDRESSES[1]);
		expect(await readFunction({provider: node, abiItem: item('x'), contract: counter, inputValues: {}})).toBe(6n);
	});

	it('leaves the records alone, and a Deploy after the writes still sends nothing', async () => {
		const records = deploymentStore.vfs.snapshot();
		const {outcome, transcript} = await run(project(), deps());
		expect(outcome.ok).toBe(true);
		expect(sent(outcome.requests)).toBe(0);
		expect(transcript.some((line) => line.includes('reusing "Counter"'))).toBe(true);
		expect(deploymentStore.vfs.snapshot()).toEqual(records);
	});

	it('runs a write only through the chain the session grants, and reports a busy one', async () => {
		let granted = true;
		const sessionChain: ContractsChain = {
			provider: () => node,
			transact: (send) => (granted ? send(node) : Promise.reject(new Error('The chain is busy (running the deploy scripts); nothing was sent.'))),
		};
		const call = createFunctionCall({abiItem: () => item('inc'), contract: () => counter, chain: () => sessionChain});
		await call.write({}, {}, signingAccounts(namedAccounts)[0]);
		expect(get(call)).toMatchObject({loading: false, error: null, transaction: {status: 'success', fromLabel: 'deployer'}});
		granted = false;
		await call.write({}, {}, signingAccounts(namedAccounts)[0]);
		expect(get(call)).toMatchObject({transaction: null, error: 'The chain is busy (running the deploy scripts); nothing was sent.'});
		await call.write({}, {by: 'uint256 cannot be negative'}, signingAccounts(namedAccounts)[0]);
		expect(get(call).error).toBe('Please fix input errors before executing');
	});
});
