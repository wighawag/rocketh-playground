/**
 * One transaction of the in-tab chain, as the Transactions view shows it: decoded with the
 * deployment records' ABIs.
 *
 * The decoding is jolly-roger's, copied at its paths (a4082a13): `decodeTransaction` and
 * `loadTransactionItemData` (`src/routes/explorer/lib/services/`) for the call and a revert's
 * reason, `decodeLogs` (`src/routes/explorer/lib/utils.ts`) for the events. What differs in the
 * playground lives here:
 *
 * - THE CONTRACTS are the records (`../contracts/records.ts`), passed to the copies as
 *   `DecodingContracts`, rather than jolly-roger's generated deployments;
 * - A DEPLOYMENT is shown as the deployment of its record ("Deploy Counter", with its constructor
 *   arguments decoded from the record's `argsData`), found by the record's `transaction.hash`, or
 *   by the receipt's `contractAddress` for a record that does not name its transaction. The copy
 *   only says "Contract Creation";
 * - THE ARGUMENTS are kept as a list of name, type and value, for the view and its tests: a
 *   call's are named from the inputs the copy keeps (the ABI item its selector names, exact for
 *   overloads), and printed as the copy's `formatDecodedArgs` prints them; a constructor's and an
 *   event's, which the copy shows as JSON, from the ABI item found by name and arity;
 * - WHO: `from` is labelled with the named account (`../contracts/accounts.ts`), `to` with the
 *   deployment's name;
 * - A TRANSFER names its recipient's label ("Transfer to Counter"); an undecoded call is titled
 *   and given its selector as the copy's `formatDecodedTransaction` does.
 *
 * WHICH RECORD DECODES AN ADDRESS: the records as they are now. A redeploy rewrites a record
 * with the new address, so an older transaction to the old address is decoded only while some
 * record still holds that address (a deployment saved under another name, say), and is shown
 * undecoded otherwise: the chain's history is not re-attributed to a contract the records no
 * longer say lives there. The list re-decodes when the records change.
 *
 * A REVERT'S REASON is found as the copy finds it, by replaying the transaction with `eth_call`
 * at its block. webevm serves that only within the node's `stateHistory` window
 * (`STATE_HISTORY_BLOCKS` in `../runner/compose-config.ts`, which the session creates the node with); older than that, the row says
 * the reason is no longer available rather than show the refusal, which reaches the copy as viem's
 * "Missing or invalid parameters" (webevm's -32000, its explanation left in the error's cause).
 */
import {
	decodeAbiParameters,
	type Abi,
	type AbiParameter,
	type PublicClient,
	type Transaction,
	type TransactionReceipt,
} from 'viem';
import {
	decodeTransaction,
	formatDecodedError,
	formatDecodedTransaction,
	type DecodedTransactionData,
} from '../../../routes/explorer/lib/services/transactionDecoder.js';
import {loadTransactionItemData} from '../../../routes/explorer/lib/services/transactionItem.js';
import {
	decodeLogs,
	type DecodingContracts,
} from '../../../routes/explorer/lib/utils.js';
import {toPlainJson} from '../../core/utils/format/index.js';
import {signingAccounts} from '../contracts/accounts.js';
import type {DeployedContract} from '../contracts/records.js';

export type Labelled = {address: `0x${string}`; label?: string};

export type DecodedArg = {name: string; type: string; value: string};

export type TransactionEvent = {
	address: `0x${string}`;
	contract?: string;
	name: string;
	args: DecodedArg[];
};

export type TransactionKind =
	'deployment' | 'creation' | 'call' | 'undecoded' | 'transfer';

export type TransactionRow = {
	hash: `0x${string}`;
	blockNumber: number;
	transactionIndex: number;
	/** Seconds, as the block says. */
	timestamp: number;
	from: Labelled;
	/** `null` for a contract creation. */
	to: Labelled | null;
	/** The address a creation made, from the receipt. */
	created?: Labelled;
	value: bigint;
	status: 'success' | 'failed' | 'pending';
	kind: TransactionKind;
	/** `Deploy Counter`, `Counter.incBy`, `Call to an unknown contract`, ... */
	title: string;
	/** The function's (or the constructor's) arguments, when decoded. */
	args?: DecodedArg[];
	/** The 4-byte selector of a call that is not decoded. */
	selector?: `0x${string}`;
	events: TransactionEvent[];
	/** Logs no record's ABI decodes. */
	undecodedEvents: number;
	/** A failed transaction's reason, as far as it can be found. */
	revert?: string;
};

/** What a row is decoded from: the transaction, its receipt, and its block's timestamp. */
export type RawTransaction = {
	tx: Transaction;
	receipt: TransactionReceipt | null;
	timestamp: number;
};

export type DecodeContext = {
	publicClient: PublicClient;
	contracts: DeployedContract[];
	namedAccounts: Record<string, string> | undefined;
	/** The chain's head, to tell a revert too old to replay. */
	head: number;
	/** The node's `stateHistory` window: `STATE_HISTORY_BLOCKS` on the page. */
	stateHistoryBlocks: number;
};

/** The records as the copies want them: name to address and ABI. */
export function decodingContracts(
	contracts: DeployedContract[],
): DecodingContracts {
	return Object.fromEntries(
		contracts.map((c) => [c.name, {address: c.address, abi: c.abi}]),
	);
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
	!!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A transaction seen for the first time: its receipt is read (the copy's `loadTransactionItemData`), then it is decoded. */
export async function loadRow(
	tx: Transaction,
	timestamp: number,
	context: DecodeContext,
): Promise<{raw: RawTransaction; row: TransactionRow}> {
	const {decodedData, receipt} = await loadTransactionItemData(
		tx,
		context.publicClient,
		decodingContracts(context.contracts),
	);
	const raw = {tx, receipt, timestamp};
	return {raw, row: buildRow(raw, decodedData, context)};
}

/** A transaction already read, decoded again: after the records or the named accounts changed. */
export async function decodeRow(
	raw: RawTransaction,
	context: DecodeContext,
): Promise<TransactionRow> {
	const decoded = await decodeTransaction(
		raw.tx,
		raw.receipt,
		context.publicClient,
		decodingContracts(context.contracts),
	);
	return buildRow(raw, decoded, context);
}

function buildRow(
	raw: RawTransaction,
	decoded: DecodedTransactionData,
	context: DecodeContext,
): TransactionRow {
	const {tx, receipt, timestamp} = raw;
	const {contracts} = context;
	const accounts = signingAccounts(context.namedAccounts);
	const label = (address: `0x${string}`): Labelled => {
		const account = accounts.find((a) => same(a.address, address));
		const contract = contracts.find((c) => same(c.address, address));
		return {address, label: contract?.name ?? account?.label};
	};
	const row: TransactionRow = {
		hash: tx.hash,
		blockNumber: Number(tx.blockNumber ?? receipt?.blockNumber ?? 0n),
		transactionIndex: tx.transactionIndex ?? receipt?.transactionIndex ?? 0,
		timestamp,
		from: label(tx.from),
		to: tx.to ? label(tx.to) : null,
		value: tx.value,
		status: decoded.status,
		kind: 'undecoded',
		title: '',
		events: [],
		undecodedEvents: 0,
	};
	if (receipt?.contractAddress) row.created = label(receipt.contractAddress);

	const deployed = contracts.find(
		(c) =>
			same(c.transactionHash, tx.hash) ||
			(!tx.to && same(c.address, receipt?.contractAddress)),
	);
	if (deployed) {
		row.kind = 'deployment';
		row.title = `Deploy ${deployed.name}`;
		row.args = constructorArgs(deployed);
	} else if (!tx.to) {
		row.kind = 'creation';
		row.title = 'Contract creation';
	} else if (decoded.isDecoded && decoded.functionName) {
		row.kind = 'call';
		row.title = formatDecodedTransaction(decoded).methodLabel;
		row.args = namedArgs(decoded.inputs ?? [], decoded.args);
	} else if (tx.input === '0x' || tx.input === '0x0') {
		row.kind = 'transfer';
		row.title = row.to?.label ? `Transfer to ${row.to.label}` : 'Transfer';
	} else {
		row.kind = 'undecoded';
		row.title = formatDecodedTransaction(decoded).methodLabel;
		row.selector = decoded.selector;
	}

	if (receipt) {
		const events = decodeLogs(receipt.logs, decodingContracts(contracts));
		row.events = events.map((event) => {
			const contract = contracts.find((c) => same(c.address, event.address));
			return {
				address: event.address,
				contract: contract?.name,
				name: event.eventName,
				args: namedArgs(
					abiInputs(contract?.abi ?? [], 'event', event.eventName, event.args),
					event.args,
				),
			};
		});
		row.undecodedEvents = receipt.logs.length - events.length;
	}
	if (decoded.status === 'failed')
		row.revert = revertReason(decoded, row.blockNumber, context);
	return row;
}

function revertReason(
	decoded: DecodedTransactionData,
	block: number,
	{head, stateHistoryBlocks}: DecodeContext,
): string {
	// webevm refuses the replay below its window (-32000, which viem reports as "Missing or
	// invalid parameters", the copy's message then): say why instead
	if (block < head - stateHistoryBlocks) {
		return `the reason is no longer available: the chain keeps the state of its last ${stateHistoryBlocks} blocks, and this is block ${block} of ${head}`;
	}
	if (
		decoded.decodedError &&
		decoded.decodedError.errorName !== 'Error' &&
		decoded.decodedError.errorName !== 'Unknown'
	) {
		return formatDecodedError(decoded.decodedError);
	}
	return decoded.error ?? 'reverted, with no reason given';
}

function constructorArgs(contract: DeployedContract): DecodedArg[] | undefined {
	const constructor = contract.abi.find((item) => item.type === 'constructor');
	if (!constructor || constructor.inputs.length === 0) return [];
	if (!contract.argsData) return undefined;
	try {
		const values = decodeAbiParameters(constructor.inputs, contract.argsData);
		return namedArgs(constructor.inputs, toPlainJson(values) as unknown[]);
	} catch {
		return undefined;
	}
}

/** The inputs of the event a decoded name and its arguments came from (overloads by arity). */
function abiInputs(
	abi: Abi,
	type: 'event',
	name: string,
	args: unknown,
): readonly AbiParameter[] {
	const count = Array.isArray(args)
		? args.length
		: args && typeof args === 'object'
			? Object.keys(args).length
			: 0;
	const items = abi.filter(
		(item) => item.type === type && item.name === name,
	) as {inputs: readonly AbiParameter[]}[];
	return (
		(items.find((item) => item.inputs.length === count) ?? items[0])?.inputs ??
		[]
	);
}

/** Each argument with its name and type; the copies give them positionally or by name. */
function namedArgs(
	inputs: readonly AbiParameter[],
	args: unknown,
): DecodedArg[] {
	if (args === undefined || args === null) return [];
	if (Array.isArray(args)) {
		return args.map((value, i) => ({
			name: inputs[i]?.name || `arg${i}`,
			type: inputs[i]?.type ?? '',
			value: formatArg(inputs[i]?.type ?? '', value),
		}));
	}
	if (typeof args === 'object') {
		return Object.entries(args as Record<string, unknown>).map(
			([key, value], i) => {
				const input = inputs.find((p) => p.name === key) ?? inputs[i];
				return {
					name: key,
					type: input?.type ?? '',
					value: formatArg(input?.type ?? '', value),
				};
			},
		);
	}
	return [{name: 'arg0', type: inputs[0]?.type ?? '', value: String(args)}];
}

/** A value as text: a number as its digits, a string quoted, a tuple or an array as JSON. */
function formatArg(type: string, value: unknown): string {
	if (typeof value === 'string' && type !== 'string') return value;
	if (typeof value === 'boolean' || typeof value === 'number')
		return String(value);
	return JSON.stringify(value);
}

/** `(by: 5)`: a function's, a constructor's or an event's arguments, as the view prints them. */
export function argsText(args: DecodedArg[]): string {
	return `(${args.map((a) => `${a.name}: ${a.value}`).join(', ')})`;
}
