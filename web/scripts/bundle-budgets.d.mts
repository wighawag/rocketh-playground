/** Types for `bundle-budgets.mjs`, so the tests can import it from TypeScript. */
export type Size = {raw: number; gzip: number};
export type Measured = Size & {measured: string};
export type Budgets = {
	firstLoad: Measured;
	onDemand: Record<string, Measured>;
	workers: Record<string, Measured>;
	runnerPackages: Record<string, Measured>;
	declarations: Measured;
	soljson: Measured;
};
export type Bundle = {group: keyof Budgets; key: string; name: string; size: Size};
type Manifest = Record<string, {file: string; css?: string[]; imports?: string[]; dynamicImports?: string[]}>;

export declare const HEADROOM: number;
export declare const BUDGETS: Budgets;
export declare function manifestClosure(manifest: Manifest, roots: string[]): {keys: Set<string>; files: Set<string>};
export declare function rootPageNode(appSource: string): number;
export declare function pageBundles(manifest: Manifest, rootNode: number): {firstLoad: Set<string>; onDemand: Map<string, Set<string>>};
export declare function fileClosure(dir: string, entries: string[]): Set<string>;
export declare function workerNames(workersSource: string): string[];
export declare function lazyPackages(runnerSource: string): Map<string, string>;
export declare function workerBundles(
	workersDir: string,
	names: string[],
): {workers: Map<string, Set<string>>; runnerPackages: Map<string, Set<string>>};
export declare function measure(dir: string, files: Iterable<string>): Size;
export declare function budgetOf(measured: Size): Size;
export declare function measureBuild(paths: {client: string; generatedApp: string; workersSource: string; soljsonPath: string}): Bundle[];
export declare function checkBudgets(bundles: Bundle[], budgets: Budgets): string[];
export declare function asBudgets(bundles: Bundle[], date: string): string;
