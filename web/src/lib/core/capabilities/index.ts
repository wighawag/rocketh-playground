// Copied from jolly-roger web/src/lib/core/capabilities/index.ts, at commit a4082a13. Changed here:
// - the navigation and document-location capabilities are not exported: the playground copies only the route, ENS and block-explorer capabilities, which `ui/ethereum/` uses
// Nothing else is changed.
export {defineCapability} from './define';
export type {
	OptionalCapability,
	FallbackCapability,
	RequiredCapability,
} from './define';
export {provideRoute, useRoute, type RouteResolver} from './route';
export {provideENS, useENS} from './ens';
export {provideBlockExplorer, useBlockExplorer} from './block-explorer';
