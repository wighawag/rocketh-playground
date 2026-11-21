/**
 * Who a write can be sent from: the test accounts, named as the reader's config names them.
 *
 * The names come from `rocketh/config.ts`, which is user code and runs only in the runner, so
 * the page never evaluates it: the runner reports the named accounts a run resolved
 * (`RunOutcome.namedAccounts`), and until a run has, every test account is labelled by its index.
 * Each one is a throwaway test key (`../runner/test-keys.ts`), so whichever is picked, the page
 * can sign for it.
 */
import {TEST_ADDRESSES} from '../runner/test-keys.js';

export type SigningAccount = {
	/** `deployer`, `admin`, ... or `account 2` for one the config does not name. */
	label: string;
	address: `0x${string}`;
	/** Which test key signs for it. */
	keyIndex: number;
};

const DEFAULT_NAME = 'deployer';

/** The test key index for an address, or -1 when no test key signs for it. */
export function testKeyIndex(address: string): number {
	return TEST_ADDRESSES.findIndex(
		(a) => a.toLowerCase() === address.toLowerCase(),
	);
}

/**
 * Every test account, named ones first in the config's order, the deployer (when named) at the
 * head: it is the one a write is sent from by default. A named account rocketh resolved to an
 * address no test key signs for is left out, since nothing could sign for it.
 */
export function signingAccounts(
	namedAccounts: Record<string, string> | undefined,
): SigningAccount[] {
	const named: SigningAccount[] = [];
	const taken = new Set<number>();
	for (const [name, address] of Object.entries(namedAccounts ?? {})) {
		const keyIndex = testKeyIndex(address);
		if (keyIndex < 0) continue;
		const same = named.find((a) => a.keyIndex === keyIndex);
		if (same) {
			same.label = `${same.label}, ${name}`;
			continue;
		}
		named.push({label: name, address: TEST_ADDRESSES[keyIndex], keyIndex});
		taken.add(keyIndex);
	}
	const isDefault = (a: SigningAccount) =>
		Number(a.label.split(', ').includes(DEFAULT_NAME));
	named.sort((a, b) => isDefault(b) - isDefault(a));
	const unnamed = TEST_ADDRESSES.flatMap((address, keyIndex) =>
		taken.has(keyIndex)
			? []
			: [{label: `account ${keyIndex}`, address, keyIndex}],
	);
	return [...named, ...unnamed];
}
