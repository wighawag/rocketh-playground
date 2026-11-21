/**
 * One run: the project's transpiled deploy scripts, through `@rocketh/web`, against a provider.
 *
 * Everything a run touches is a parameter (the provider, the deployment store, the log stream,
 * how packages are loaded), so the same function runs in the runner worker, where the provider is
 * a MessagePort to the EVM worker, and in the node tests, where it is a webevm node in-process.
 *
 * It imports no rocketh module statically: every package comes from `loadPackages`, after the
 * runner's log factory is installed (`./log-hook.ts`), and only the ones the run imports.
 */
import {captureConsole, type LogStream} from '@rocketh/playground/log';
import type {DeploymentStore} from '@rocketh/core/types';
import type {ProjectFiles} from '../project/template.js';
import {BARE_MODULES, type BareModuleName} from './bare-modules.js';
import {CHAIN_ID, ENVIRONMENT, composeConfig} from './compose-config.js';
import {routeRockethLogs} from './log-hook.js';
import {checkImports, createRegistry} from './registry.js';
import {TEST_ADDRESSES, TEST_KEYS} from './test-keys.js';

export type RequestProvider = {
	request(args: {method: string; params?: unknown}): Promise<unknown>;
};

export type RunInput = {
	/** CommonJS per project path, from the TypeScript worker (`transpileProject`). */
	modules: ProjectFiles;
	/** Run-time imports per path, from the same. */
	imports: Record<string, string[]>;
};

export type RunDependencies = {
	provider: RequestProvider;
	deploymentStore: DeploymentStore;
	logs: LogStream;
	/** Defaults to `BARE_MODULES`, each a dynamic import. */
	loadPackages?: (
		names: BareModuleName[],
	) => Promise<Partial<Record<BareModuleName, object>>>;
};

export type RunError = {name: string; message: string; stack?: string};

export type RunOutcome = {
	ok: boolean;
	error?: RunError;
	/** Name to address, for every deployment the environment holds after the run. */
	deployments: Record<string, string>;
	/**
	 * Name to address, for each named account of the reader's config: what rocketh resolved
	 * (`env.namedAccounts`) after a run that completed, or, when a script failed after the config
	 * loaded, what the composed config gives each name (its test key's address). Absent when the
	 * config never loaded. The page labels its account picker with these, since it never
	 * evaluates the config itself.
	 */
	namedAccounts?: Record<string, string>;
	/** Requests the run made, by method: `eth_sendRawTransaction` absent means it sent nothing. */
	requests: Record<string, number>;
	ms: number;
};

export const CONFIG_PATH = 'rocketh/config.ts';

/** The deploy scripts of a project, in the order rocketh's executor is given them. */
export function deployScriptPaths(modules: ProjectFiles): string[] {
	return Object.keys(modules)
		.filter((path) => path.startsWith('deploy/') && /\.[cm]?[jt]s$/.test(path))
		.sort();
}

export async function loadBareModules(
	names: BareModuleName[],
): Promise<Partial<Record<BareModuleName, object>>> {
	const loaded = await Promise.all(
		names.map(async (name) => [name, await BARE_MODULES[name]()] as const),
	);
	return Object.fromEntries(loaded);
}

/** Each name `composeConfig` gave a test key, with that key's address. */
function composedNamedAccounts(
	accounts: Record<string, {default: string}>,
): Record<string, string> {
	const named: Record<string, string> = {};
	for (const [name, {default: value}] of Object.entries(accounts)) {
		const index = TEST_KEYS.indexOf(
			value.slice('privateKey:'.length) as (typeof TEST_KEYS)[number],
		);
		if (index >= 0) named[name] = TEST_ADDRESSES[index];
	}
	return named;
}

function toRunError(error: unknown): RunError {
	if (error instanceof Error)
		return {name: error.name, message: error.message, stack: error.stack};
	return {name: 'Error', message: String(error)};
}

export async function runDeployScripts(
	input: RunInput,
	dependencies: RunDependencies,
): Promise<RunOutcome> {
	const {deploymentStore, logs} = dependencies;
	const loadPackages = dependencies.loadPackages ?? loadBareModules;
	const requests: Record<string, number> = {};
	const provider: RequestProvider = {
		request(args) {
			requests[args.method] = (requests[args.method] ?? 0) + 1;
			return dependencies.provider.request(args);
		},
	};
	const t0 = performance.now();
	const stopRouting = routeRockethLogs(logs);
	const capture = captureConsole(logs);
	let namedAccounts: Record<string, string> | undefined;
	try {
		const scripts = deployScriptPaths(input.modules);
		if (!(CONFIG_PATH in input.modules))
			throw new Error(`the project has no ${CONFIG_PATH}`);
		// Every import is checked, and every package loaded, BEFORE any project file is evaluated:
		// an unsupported import fails the run before a script has sent anything.
		const needed = checkImports(input.modules, input.imports, [
			CONFIG_PATH,
			...scripts,
		]);
		const packages = await loadPackages([
			...new Set<BareModuleName>([
				...needed,
				'@rocketh/web',
				'@rocketh/signer',
			]),
		]);
		const web = packages['@rocketh/web'] as typeof import('@rocketh/web');
		const signer = packages[
			'@rocketh/signer'
		] as typeof import('@rocketh/signer');

		const registry = createRegistry(input.modules, packages);
		const configModule = registry.load(CONFIG_PATH) as {
			config?: unknown;
			extensions?: unknown;
		};
		if (!configModule.config || !configModule.extensions) {
			throw new Error(
				`${CONFIG_PATH} must export \`config\` and \`extensions\``,
			);
		}
		const moduleObjects = scripts.map((path) => {
			const exported = registry.load(path) as {default?: unknown};
			if (typeof exported.default !== 'function') {
				throw new Error(
					`${path} has no default export made with deployScript(...)`,
				);
			}
			return {id: path.slice('deploy/'.length), module: exported.default};
		});

		const config = composeConfig(
			configModule.config as Record<string, unknown>,
			signer.privateKey,
		);
		namedAccounts = composedNamedAccounts(
			config.accounts as Record<string, {default: string}>,
		);
		const {loadAndExecuteDeploymentsFromModules} = web.setupEnvironment(
			config as never,
			configModule.extensions as never,
			{deploymentStore},
		);
		const env = await loadAndExecuteDeploymentsFromModules(
			moduleObjects as never,
			{
				provider: provider as never,
				environment: ENVIRONMENT,
				saveDeployments: true,
				askBeforeProceeding: false,
				// webevm has already mined by the time a send returns, and answers `evm_mine` with -32601.
				autoMine: false,
			} as never,
		);
		const deployments = Object.fromEntries(
			Object.entries(
				(env as unknown as {deployments: Record<string, {address: string}>})
					.deployments,
			).map(([name, d]) => [name, d.address]),
		);
		namedAccounts = {
			...(env as unknown as {namedAccounts: Record<string, string>})
				.namedAccounts,
		};
		return {
			ok: true,
			deployments,
			namedAccounts,
			requests,
			ms: performance.now() - t0,
		};
	} catch (error) {
		const runError = toRunError(error);
		logs.append('error', runError.message);
		return {
			ok: false,
			error: runError,
			deployments: {},
			...(namedAccounts ? {namedAccounts} : {}),
			requests,
			ms: performance.now() - t0,
		};
	} finally {
		capture.release();
		stopRouting();
	}
}

export {CHAIN_ID, ENVIRONMENT};
