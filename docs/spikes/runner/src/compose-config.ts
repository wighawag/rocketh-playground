/**
 * The config a run uses: the reader's `rocketh/config.ts` as written, except for the three things
 * an EVM in the tab requires (rocketh `documentation/browser/index.md`, "Accounts" and "autoMine"):
 *
 * - `accounts` are REPLACED by test keys through the `privateKey` protocol. webevm holds no keys
 *   and answers no `eth_accounts`, so `deployer: 0` cannot resolve. An index `n` becomes test key
 *   `n`, so the template's `deployer: 0, admin: 1` keep their meaning;
 * - the in-tab chain is declared, with no RPC URL, so rocketh does not warn about an unknown chain
 *   and nothing suggests the chain is reachable over the network;
 * - the environment is named `playground`: `memory`, `hardhat` and `default` save nothing.
 *
 * `autoMine: false` is an execution parameter, passed by the runner.
 */
import {privateKeyToAccount} from 'viem/accounts';

export const ENVIRONMENT = 'playground';
export const CHAIN_ID = 31337;

/**
 * THROWAWAY TEST KEYS: the well-known anvil/hardhat development keys, public for years. They exist
 * only so the in-tab chain has someone to sign for. Never exported in a project.
 */
export const TEST_KEYS = [
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
	'0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
	'0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
] as const;

export const TEST_ADDRESSES = TEST_KEYS.map((key) => privateKeyToAccount(key).address);

type AnyConfig = Record<string, unknown> & {
	accounts?: Record<string, unknown>;
	chains?: Record<string, Record<string, unknown>>;
	environments?: Record<string, unknown>;
	signerProtocols?: Record<string, unknown>;
};

export function composeConfig(userConfig: AnyConfig, privateKeyProtocol: unknown): AnyConfig {
	const accounts: Record<string, {default: string}> = {};
	let next = 0;
	for (const [name, value] of Object.entries(userConfig.accounts ?? {})) {
		const declared = (value as {default?: unknown})?.default;
		const index = typeof declared === 'number' ? declared : next;
		next = Math.max(next, index + 1);
		const key = TEST_KEYS[index];
		if (!key) throw new Error(`account "${name}" needs test key ${index}; the playground has ${TEST_KEYS.length}`);
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
