// Copied from jolly-roger web/src/lib/core/capabilities/block-explorer.ts, at commit a4082a13; nothing below this line is changed.
import {defineCapability} from './define';
import type {BlockExplorer} from '$lib/core/utils/ethereum/blockExplorer';

/**
 * The block explorer capability: where an address or a transaction links to.
 *
 * Optional (no fallback), like ENS: `Address` and `TransactionHash` render
 * without it, and `linkTo="auto"` then resolves to no link (an explicit
 * `internal` still links, since it needs only the route). The app composes
 * its explorer from its chain and its configuration and provides it at the
 * root (jolly-roger: `$lib/index.ts` and routes/+layout.svelte).
 */
const blockExplorerCapability =
	defineCapability<BlockExplorer>('block-explorer');

export const provideBlockExplorer = blockExplorerCapability.provide;
export const useBlockExplorer = blockExplorerCapability.use;
