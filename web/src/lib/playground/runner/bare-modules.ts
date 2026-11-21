/**
 * The packages a project file may import by name, each loaded only when a run imports it.
 *
 * A bundled namespace cannot be tree-shaken (the registry must hand a script whatever it
 * imports), so loading them all up front made the runner spike's worker 477 KB gzip, 139 KB of it
 * `@rocketh/proxy` and `@rocketh/diamond` alone. Each is a separate chunk here, fetched by the
 * runner before a run that needs it.
 *
 * The list is the spec's: rocketh and the @rocketh/* packages a project spreads into its
 * extensions (`@rocketh/unknown-signer` because the template's `rocketh/config.ts` spreads it),
 * and `viem` with its public subpaths. Not `viem/node` (node IPC transports) or `viem/window`
 * (a type declaration for `window.ethereum`, which a worker has not got).
 */
export const BARE_MODULES = {
	rocketh: () => import('rocketh'),
	'@rocketh/deploy': () => import('@rocketh/deploy'),
	'@rocketh/proxy': () => import('@rocketh/proxy'),
	'@rocketh/diamond': () => import('@rocketh/diamond'),
	'@rocketh/router': () => import('@rocketh/router'),
	'@rocketh/read-execute': () => import('@rocketh/read-execute'),
	'@rocketh/viem': () => import('@rocketh/viem'),
	'@rocketh/signer': () => import('@rocketh/signer'),
	'@rocketh/unknown-signer': () => import('@rocketh/unknown-signer'),
	'@rocketh/web': () => import('@rocketh/web'),
	viem: () => import('viem'),
	'viem/account-abstraction': () => import('viem/account-abstraction'),
	'viem/accounts': () => import('viem/accounts'),
	'viem/actions': () => import('viem/actions'),
	'viem/celo': () => import('viem/celo'),
	'viem/chains': () => import('viem/chains'),
	'viem/chains/utils': () => import('viem/chains/utils'),
	'viem/ens': () => import('viem/ens'),
	'viem/experimental': () => import('viem/experimental'),
	'viem/experimental/erc7739': () => import('viem/experimental/erc7739'),
	'viem/experimental/erc7811': () => import('viem/experimental/erc7811'),
	'viem/experimental/erc7821': () => import('viem/experimental/erc7821'),
	'viem/experimental/erc7846': () => import('viem/experimental/erc7846'),
	'viem/experimental/erc7895': () => import('viem/experimental/erc7895'),
	'viem/linea': () => import('viem/linea'),
	'viem/nonce': () => import('viem/nonce'),
	'viem/op-stack': () => import('viem/op-stack'),
	'viem/siwe': () => import('viem/siwe'),
	'viem/tempo': () => import('viem/tempo'),
	'viem/tempo/actions': () => import('viem/tempo/actions'),
	'viem/tempo/chains': () => import('viem/tempo/chains'),
	'viem/tokens': () => import('viem/tokens'),
	'viem/utils': () => import('viem/utils'),
	'viem/zksync': () => import('viem/zksync'),
} satisfies Record<string, () => Promise<object>>;

export type BareModuleName = keyof typeof BARE_MODULES;

/**
 * Subpaths a project may import TYPES from (`import type {UserConfig} from 'rocketh/types'`, as the
 * template's `rocketh/config.ts` does). A type-only import is erased by the transpiler, so they are
 * not in the registry; the editor's language service has their declarations.
 */
export const TYPE_ONLY_MODULES = ['rocketh/types', '@rocketh/diamond/types'] as const;

export const BARE_MODULE_NAMES = Object.keys(BARE_MODULES) as BareModuleName[];

export function isBareModuleName(name: string): name is BareModuleName {
	return Object.prototype.hasOwnProperty.call(BARE_MODULES, name);
}

/** The list as a reader reads it in an error: the packages, then viem's subpaths in one item. */
export function describeSupportedImports(): string {
	const packages = BARE_MODULE_NAMES.filter((n) => !n.startsWith('viem/'));
	const viemSubpaths = BARE_MODULE_NAMES.filter((n) => n.startsWith('viem/'));
	return `${packages.join(', ')}, and viem's subpaths (${viemSubpaths.join(', ')})`;
}
