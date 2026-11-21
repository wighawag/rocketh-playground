/**
 * The contracts the Contracts view lists, read from the deployment records.
 *
 * jolly-roger builds the same list from a generated `deployments.ts` (`web/src/routes/contracts/
 * +page.svelte` at 8a73e680, `$deployments.contracts`). The playground has no such file: what a
 * run leaves is the deployment store, `deployments/playground/<Name>.json`, each holding the
 * address and the ABI. So the list is derived from `records` (the session's copy of that store)
 * and follows it: a redeploy rewrites the record, and the list shows the new address and ABI.
 */
import type {Abi, AbiFunction} from 'viem';
import {
	getContractFunctions,
	isViewFunction,
} from '../../../routes/contracts/lib/utils.js';
import {ENVIRONMENT} from '../runner/compose-config.js';
import type {ProjectFiles} from '../project/template.js';

export type DeployedContract = {
	/** The deployment's name, which is its record's file name: `Counter`. */
	name: string;
	address: `0x${string}`;
	abi: Abi;
	/** The record it was read from, `deployments/playground/Counter.json`. */
	path: string;
	/** The transaction that deployed it, as the record says (`transaction.hash`), when it does. */
	transactionHash?: `0x${string}`;
	/** Its ABI-encoded constructor arguments (`argsData`), when the record has them. */
	argsData?: `0x${string}`;
	viewFunctions: AbiFunction[];
	writeFunctions: AbiFunction[];
};

const FOLDER = `deployments/${ENVIRONMENT}/`;

/**
 * The session hands out a new `records` object only when the store changed, and the page asks on
 * every session update: the parse is kept per object.
 */
const parsed = new WeakMap<ProjectFiles, DeployedContract[]>();

/** One entry per deployment record, by name. A record that does not parse is left out. */
export function contractsFromRecords(
	records: ProjectFiles,
): DeployedContract[] {
	let contracts = parsed.get(records);
	if (!contracts) {
		contracts = parseRecords(records);
		parsed.set(records, contracts);
	}
	return contracts;
}

function parseRecords(records: ProjectFiles): DeployedContract[] {
	const contracts: DeployedContract[] = [];
	for (const [path, content] of Object.entries(records)) {
		if (!path.startsWith(FOLDER) || !path.endsWith('.json')) continue;
		const file = path.slice(FOLDER.length);
		// `.chain`, `.migrations.json` and pending transactions are rocketh's, not deployments
		if (file.includes('/') || file.startsWith('.')) continue;
		let record: {
			address?: unknown;
			abi?: unknown;
			argsData?: unknown;
			transaction?: {hash?: unknown};
		};
		try {
			record = JSON.parse(content);
		} catch {
			continue;
		}
		if (
			typeof record.address !== 'string' ||
			!/^0x[0-9a-fA-F]{40}$/.test(record.address) ||
			!Array.isArray(record.abi)
		)
			continue;
		const abi = record.abi as Abi;
		const functions = getContractFunctions(abi);
		contracts.push({
			name: file.slice(0, -'.json'.length),
			address: record.address as `0x${string}`,
			abi,
			path,
			...(isHex(record.transaction?.hash)
				? {transactionHash: record.transaction.hash}
				: {}),
			...(isHex(record.argsData) ? {argsData: record.argsData} : {}),
			viewFunctions: functions.filter((f) => isViewFunction(f.stateMutability)),
			writeFunctions: functions.filter(
				(f) => !isViewFunction(f.stateMutability),
			),
		});
	}
	return contracts.sort((a, b) => a.name.localeCompare(b.name));
}

const isHex = (value: unknown): value is `0x${string}` =>
	typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
