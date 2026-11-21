/**
 * One function's form state on the Contracts view, as a store: what jolly-roger's
 * `ContractFunction.svelte` (8a73e680) keeps in `$state` and does in `handleFetch` /
 * `handleExecute`, moved out of the component.
 *
 * Reads go to the chain whenever it is there. Writes go through `ContractsChain.transact`, which
 * the session grants only while nothing else uses the chain (never during a run), so a write can
 * not interleave with rocketh's own transactions and their nonces.
 */
import {writable, type Readable} from 'svelte/store';
import type {AbiFunction} from 'viem';
import type {SigningAccount} from './accounts.js';
import {
	callErrorMessage,
	readFunction,
	writeFunction,
	type ContractTarget,
	type RequestProvider,
	type WriteOutcome,
} from './chain-calls.js';

/** What the view needs of the session. */
export type ContractsChain = {
	/** The in-tab node, for reads; undefined before it has started. */
	provider(): RequestProvider | undefined;
	/** Run a write with the chain to itself; rejects when the chain is busy. */
	transact<T>(send: (provider: RequestProvider) => Promise<T>): Promise<T>;
};

export type FunctionCallState = {
	loading: boolean;
	/** The decoded result of the last read; `null` before one. */
	result: unknown;
	transaction: (WriteOutcome & {fromLabel: string}) | null;
	error: string | null;
};

export type FunctionCallStore = Readable<FunctionCallState> & {
	read(inputValues: Record<string, string>): Promise<void>;
	write(
		inputValues: Record<string, string>,
		inputErrors: Record<string, string>,
		from: SigningAccount,
	): Promise<void>;
	clear(): void;
};

const initial: FunctionCallState = {
	loading: false,
	result: null,
	transaction: null,
	error: null,
};

export function createFunctionCall(deps: {
	abiItem: () => AbiFunction;
	contract: () => ContractTarget;
	chain: () => ContractsChain;
}): FunctionCallStore {
	const store = writable<FunctionCallState>(initial);

	async function read(inputValues: Record<string, string>) {
		const provider = deps.chain().provider();
		if (!provider) {
			store.set({...initial, error: 'The chain has not started yet'});
			return;
		}
		store.set({...initial, loading: true});
		try {
			const result = await readFunction({
				provider,
				abiItem: deps.abiItem(),
				contract: deps.contract(),
				inputValues,
			});
			store.set({...initial, result});
		} catch (e) {
			store.set({...initial, error: callErrorMessage(e)});
		}
	}

	async function write(
		inputValues: Record<string, string>,
		inputErrors: Record<string, string>,
		from: SigningAccount,
	) {
		if (Object.values(inputErrors).some((e) => e !== undefined)) {
			store.update((s) => ({
				...s,
				error: 'Please fix input errors before executing',
			}));
			return;
		}
		store.set({...initial, loading: true});
		try {
			const outcome = await deps.chain().transact((provider) =>
				writeFunction({
					provider,
					abiItem: deps.abiItem(),
					contract: deps.contract(),
					inputValues,
					keyIndex: from.keyIndex,
				}),
			);
			store.set({
				...initial,
				transaction: {...outcome, fromLabel: from.label},
				error:
					outcome.status === 'reverted'
						? 'The transaction was mined and reverted'
						: null,
			});
		} catch (e) {
			store.set({...initial, error: callErrorMessage(e)});
		}
	}

	return {
		subscribe: store.subscribe,
		read,
		write,
		clear: () => store.set(initial),
	};
}
