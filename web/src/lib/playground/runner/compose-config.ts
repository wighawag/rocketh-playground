/**
 * The config a run uses: the reader's `rocketh/config.ts` as written, except for what an EVM in
 * the tab requires (rocketh `documentation/browser/index.md`, "Against an EVM in the tab"):
 *
 * - `accounts` are REPLACED by test keys through the `privateKey` protocol. webevm holds no keys
 *   and answers no `eth_accounts`, so `deployer: 0` cannot resolve. An index `n` becomes test key
 *   `n`, so the template's `deployer: 0, admin: 1` keep their meaning; any other declaration
 *   takes the next unused key;
 * - the in-tab chain is declared, with no RPC URL, so rocketh does not warn about an unknown chain
 *   and nothing suggests the chain is reachable over the network;
 * - the environment is named `playground`: `memory`, `hardhat` and `default` save nothing.
 *
 * `autoMine: false` is an execution parameter, passed by `run.ts`.
 */
import {TEST_KEYS} from './test-keys.js';

export const ENVIRONMENT = 'playground';
export const CHAIN_ID = 31337;
/**
 * How many blocks below its head the in-tab chain keeps the state of (webevm's `stateHistory`,
 * persisted with the chain): the Transactions view finds a revert's reason by replaying the
 * transaction at its block, which webevm refuses below that window. About 300 bytes per key a
 * block changes, per block kept (webevm's measure); a call to Counter changes a handful.
 */
export const STATE_HISTORY_BLOCKS = 256;

type AnyConfig = Record<string, unknown> & {
	accounts?: Record<string, unknown>;
	chains?: Record<string, Record<string, unknown>>;
	environments?: Record<string, unknown>;
	signerProtocols?: Record<string, unknown>;
};

export function composeConfig(userConfig: AnyConfig, privateKeyProtocol: unknown): AnyConfig {
	const accounts: Record<string, {default: string}> = {};
	const used = new Set<number>();
	const declared = Object.entries(userConfig.accounts ?? {}).map(
		([name, value]) => [name, (value as {default?: unknown} | undefined)?.default] as const,
	);
	for (const [, value] of declared) if (typeof value === 'number') used.add(value);
	let next = 0;
	for (const [name, value] of declared) {
		let index: number;
		if (typeof value === 'number') {
			index = value;
		} else {
			while (used.has(next)) next++;
			index = next;
			used.add(index);
		}
		const key = TEST_KEYS[index];
		if (!key) throw new Error(`account "${name}" needs test key ${index}, and the playground has ${TEST_KEYS.length}`);
		accounts[name] = {default: `privateKey:${key}`};
	}
	const chains = userConfig.chains ?? {};
	return {
		...userConfig,
		accounts,
		chains: {
			...chains,
			[CHAIN_ID]: {
				...(chains[String(CHAIN_ID)] ?? {}),
				info: {
					id: CHAIN_ID,
					name: 'EVM in this tab',
					nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
					rpcUrls: {default: {http: []}},
					testnet: true,
				},
			},
		},
		environments: {...(userConfig.environments ?? {}), [ENVIRONMENT]: {chain: CHAIN_ID}},
		signerProtocols: {...(userConfig.signerProtocols ?? {}), privateKey: privateKeyProtocol},
	};
}
