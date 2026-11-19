/**
 * Reading and calling a deployed contract's functions on the chain in the tab.
 *
 * This is where the playground differs from jolly-roger's `web/src/routes/contracts/lib/
 * contractCall.ts` (8a73e680): no wallet, no connection, no executor. `readFunction` is that
 * file's `readContractValue` with its public client built here, over the in-tab node.
 * `writeFunction` replaces `executeContractWrite`: the transaction is signed on the page with a
 * throwaway test key (`../runner/test-keys.ts`) and sent raw to the same node.
 *
 * WHY THE PAGE SIGNS, rather than the EVM worker. The page already holds the node (webevm's own
 * proxy, which `../session.ts` drives), so a write is viem's local-account flow over it, as
 * webevm's README shows, and the EVM worker keeps exposing webevm's api unchanged. The keys are
 * public test keys, so holding them on the page exposes nothing, and no user code runs on the
 * page to reach them. What it costs is viem's signing and ABI code in the page bundle; this
 * module is loaded with the Contracts view, not with the page.
 *
 * MINING. The page creates the node with webevm's default `miningConfig: {type: 'auto'}`: a raw
 * transaction is mined into its own block before `eth_sendRawTransaction` returns. That is also
 * why the runner passes rocketh `autoMine: false` (webevm answers `evm_mine` with -32601). So
 * the receipt is read straight after the send, with no polling.
 *
 * A REVERT is found before anything is sent: viem estimates the gas first, webevm's estimate
 * fails with the revert data, and viem decodes it with the contract's ABI. Such a write sends
 * nothing, as a wallet would.
 */
import {
	BaseError,
	ContractFunctionRevertedError,
	createPublicClient,
	createWalletClient,
	custom,
	defineChain,
	type Abi,
	type AbiFunction,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {convertInputValues} from '../../../routes/contracts/lib/utils.js';
import {bigIntReplacer, errorMessage} from '../../core/utils/format/index.js';
import {CHAIN_ID} from '../runner/compose-config.js';
import {TEST_KEYS} from '../runner/test-keys.js';

export type RequestProvider = {request(args: {method: string; params?: unknown}): Promise<unknown>};

export type ContractTarget = {address: `0x${string}`; abi: Abi};

export type WriteOutcome = {
	hash: `0x${string}`;
	status: 'success' | 'reverted';
	blockNumber: bigint;
	gasUsed: bigint;
	from: `0x${string}`;
};

/** The chain in the tab, as viem wants it: no RPC URL, since none exists. */
export const inTabChain = defineChain({
	id: CHAIN_ID,
	name: 'EVM in this tab',
	nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
	rpcUrls: {default: {http: []}},
	testnet: true,
});

function transport(provider: RequestProvider) {
	return custom({request: (args: {method: string; params?: unknown}) => provider.request(args)}, {retryCount: 0});
}

/** The function, and the contract's errors, so a custom error is decoded by name. */
function callAbi(abiItem: AbiFunction, abi: Abi): Abi {
	return [abiItem, ...abi.filter((item) => item.type === 'error')];
}

export async function readFunction(params: {
	provider: RequestProvider;
	abiItem: AbiFunction;
	contract: ContractTarget;
	inputValues: Record<string, string>;
}): Promise<unknown> {
	const {provider, abiItem, contract, inputValues} = params;
	const publicClient = createPublicClient({chain: inTabChain, transport: transport(provider)});
	const args = convertInputValues(abiItem.inputs, inputValues);
	return publicClient.readContract({
		address: contract.address,
		abi: callAbi(abiItem, contract.abi),
		functionName: abiItem.name,
		// Dynamic args from user input: the type cannot be inferred at compile time
		args: args as never,
	});
}

export async function writeFunction(params: {
	provider: RequestProvider;
	abiItem: AbiFunction;
	contract: ContractTarget;
	inputValues: Record<string, string>;
	/** Which test key signs (`SigningAccount.keyIndex`). */
	keyIndex: number;
}): Promise<WriteOutcome> {
	const {provider, abiItem, contract, inputValues, keyIndex} = params;
	const key = TEST_KEYS[keyIndex];
	if (!key) throw new Error(`there is no test key ${keyIndex}`);
	const account = privateKeyToAccount(key);
	const t = transport(provider);
	const wallet = createWalletClient({account, chain: inTabChain, transport: t});
	const publicClient = createPublicClient({chain: inTabChain, transport: t});
	const args = convertInputValues(abiItem.inputs, inputValues);
	const hash = await wallet.writeContract({
		address: contract.address,
		abi: callAbi(abiItem, contract.abi),
		functionName: abiItem.name,
		args: args as never,
	} as never);
	// Mined already (automine, above): a missing receipt means the node was set up otherwise.
	const receipt = await publicClient.getTransactionReceipt({hash}).catch(() => undefined);
	if (!receipt) throw new Error(`sent ${hash}, but the chain has not mined it`);
	return {hash, status: receipt.status, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, from: account.address};
}

function formatArg(value: unknown): string {
	return typeof value === 'bigint' ? value.toString() : JSON.stringify(value, bigIntReplacer);
}

/**
 * One line for a failed read or write: `reverted: <reason>` when the contract reverted (a custom
 * error as `reverted: Name(args)`), viem's
 * short message otherwise (its full message is a multi-line dump).
 */
export function callErrorMessage(error: unknown): string {
	if (error instanceof BaseError) {
		const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
		if (reverted instanceof ContractFunctionRevertedError) {
			// viem sets `reason` for `Error(string)` and `Panic` only; a custom error is in `data`
			if (reverted.reason) return `reverted: ${reverted.reason}`;
			if (reverted.data) return `reverted: ${reverted.data.errorName}(${(reverted.data.args ?? []).map(formatArg).join(', ')})`;
			if (reverted.signature) return `reverted with an error the ABI does not declare (${reverted.signature})`;
			return 'reverted, with no reason given';
		}
		return error.shortMessage;
	}
	return errorMessage(error, 'the call failed');
}
