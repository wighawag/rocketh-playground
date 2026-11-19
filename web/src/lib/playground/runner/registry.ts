/**
 * The runner's module registry: how a transpiled (CommonJS) project file finds what it imports.
 *
 * - a RELATIVE specifier resolves against the importing file to another project file. TypeScript
 *   projects import `./config.js` for `config.ts`, so `.js` is tried as `.ts` too;
 * - a BARE specifier resolves to a package from `./bare-modules.ts`, already loaded;
 * - anything else fails, naming the specifier, the file that imported it and the list.
 *
 * `checkImports` applies the same rules BEFORE anything is evaluated, from the imports the
 * transpiler read, so an unsupported import fails a run before any script has sent anything,
 * and the runner knows which packages to load.
 */
import type {ProjectFiles} from '../project/template.js';
import {describeSupportedImports, isBareModuleName, type BareModuleName} from './bare-modules.js';

export class UnsupportedImportError extends Error {
	constructor(
		readonly specifier: string,
		readonly from: string,
	) {
		super(
			`${from} imports "${specifier}", which the playground cannot provide. It resolves relative ` +
				`imports to project files, and these packages: ${describeSupportedImports()}.`,
		);
		this.name = 'UnsupportedImportError';
	}
}

export class MissingFileError extends Error {
	constructor(
		readonly specifier: string,
		readonly from: string,
	) {
		super(`${from} imports "${specifier}", and the project has no such file.`);
		this.name = 'MissingFileError';
	}
}

function isRelative(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

function normalize(path: string): string {
	const out: string[] = [];
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') out.pop();
		else out.push(segment);
	}
	return out.join('/');
}

export function resolveRelative(files: ProjectFiles, specifier: string, from: string): string | undefined {
	const base = normalize(`${dirname(from)}/${specifier}`);
	const candidates = [base];
	if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts');
	if (!/\.[cm]?[jt]s$/.test(base)) candidates.push(`${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`);
	return candidates.find((c) => c in files);
}

/**
 * The bare packages the modules reachable from `entries` import. Throws the error a run would
 * hit, for the first unsupported or missing import, in the order the files would load.
 */
export function checkImports(
	modules: ProjectFiles,
	imports: Record<string, string[]>,
	entries: string[],
): BareModuleName[] {
	const needed = new Set<BareModuleName>();
	const seen = new Set<string>();
	const visit = (file: string) => {
		if (seen.has(file)) return;
		seen.add(file);
		for (const specifier of imports[file] ?? []) {
			if (isRelative(specifier)) {
				const target = resolveRelative(modules, specifier, file);
				if (!target) throw new MissingFileError(specifier, file);
				visit(target);
			} else if (isBareModuleName(specifier)) {
				needed.add(specifier);
			} else {
				throw new UnsupportedImportError(specifier, file);
			}
		}
	};
	for (const entry of entries) visit(entry);
	return [...needed];
}

/**
 * An ES module namespace has no `__esModule` marker, so TypeScript's `__importStar` would copy it
 * and ADD a `default` key pointing at the namespace. A config spreading `{...deployExtension}`
 * would then hand rocketh an extension entry called `default` that is not a function, which
 * `withEnvironment` refuses. Marked non-enumerably (so a spread does not copy the marker), the
 * namespace passes through `__importStar` as it is.
 */
function asCommonJS(namespace: object): object {
	const copy: Record<string, unknown> = {};
	for (const key of Object.keys(namespace)) copy[key] = (namespace as Record<string, unknown>)[key];
	Object.defineProperty(copy, '__esModule', {value: true});
	return copy;
}

export function createRegistry(modules: ProjectFiles, bare: Partial<Record<BareModuleName, object>>) {
	const packages = new Map(Object.entries(bare).map(([name, ns]) => [name, asCommonJS(ns as object)]));
	const cache = new Map<string, {exports: unknown}>();

	function requireFrom(from: string) {
		return (specifier: string): unknown => {
			if (isRelative(specifier)) {
				const path = resolveRelative(modules, specifier, from);
				if (!path) throw new MissingFileError(specifier, from);
				return load(path);
			}
			const loaded = packages.get(specifier);
			if (loaded) return loaded;
			// Supported but not loaded means `checkImports` was not given this import, which is a
			// playground bug, not the reader's; still name the import.
			throw new UnsupportedImportError(specifier, from);
		};
	}

	function load(path: string): unknown {
		const cached = cache.get(path);
		if (cached) return cached.exports;
		const module = {exports: {} as unknown};
		cache.set(path, module);
		// `sourceURL` names the file in a stack trace, so an error thrown by a script points at
		// `deploy/01_deploy_counter.ts` rather than at an anonymous function.
		const evaluate = new Function('exports', 'require', 'module', `${modules[path]}\n//# sourceURL=project:///${path}`);
		try {
			evaluate(module.exports, requireFrom(path), module);
		} catch (error) {
			cache.delete(path);
			throw error;
		}
		return module.exports;
	}

	return {
		load(path: string): unknown {
			if (!(path in modules)) throw new Error(`the project has no ${path}`);
			return load(path);
		},
	};
}
