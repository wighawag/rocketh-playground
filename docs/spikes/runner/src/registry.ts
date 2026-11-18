/**
 * The runner's module registry: how a transpiled (CommonJS) project file finds what it imports.
 *
 * - a RELATIVE specifier resolves against the importing file to another project file. TypeScript
 *   projects import `./config.js` for `config.ts`, so `.js` is tried as `.ts` too;
 * - a BARE specifier resolves to a module bundled into the runner, from a fixed list;
 * - anything else fails, naming the specifier, the file that imported it and the list.
 *
 * No DOM, no worker API: it runs the same in node, which is how it can be tested headlessly.
 */

export type BareModules = Record<string, object>;

export class UnsupportedImportError extends Error {
	constructor(specifier: string, from: string, supported: string[]) {
		super(
			`${from} imports "${specifier}", which the playground cannot provide. ` +
				`It resolves relative imports to project files, and these packages: ${supported.join(', ')}.`,
		);
		this.name = 'UnsupportedImportError';
	}
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

/**
 * An ES module namespace has no `__esModule` marker, so TypeScript's `__importStar` would copy it
 * and ADD a `default` key pointing at the namespace. A config that then spreads
 * `{...deployExtension}` would hand rocketh an extension entry called `default` that is not a
 * function, which `withEnvironment` refuses. Marked (non-enumerably, so a spread does not copy
 * it), the namespace passes through `__importStar` as it is.
 */
function asCommonJS(namespace: object): object {
	const copy: Record<string, unknown> = {};
	for (const key of Object.keys(namespace)) copy[key] = (namespace as Record<string, unknown>)[key];
	Object.defineProperty(copy, '__esModule', {value: true});
	return copy;
}

export function createRegistry(files: Record<string, string>, bare: BareModules) {
	const supported = Object.keys(bare);
	const bareModules = new Map(Object.entries(bare).map(([name, ns]) => [name, asCommonJS(ns)]));
	const cache = new Map<string, {exports: unknown}>();

	function resolveFile(specifier: string, from: string): string | undefined {
		const base = normalize(`${dirname(from)}/${specifier}`);
		const candidates = [base];
		if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts');
		if (!/\.[cm]?[jt]s$/.test(base)) candidates.push(`${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`);
		return candidates.find((c) => c in files);
	}

	function requireFrom(from: string) {
		return (specifier: string): unknown => {
			if (specifier.startsWith('./') || specifier.startsWith('../')) {
				const path = resolveFile(specifier, from);
				if (!path) {
					throw new Error(`${from} imports "${specifier}", and the project has no such file.`);
				}
				return load(path);
			}
			const module = bareModules.get(specifier);
			if (!module) throw new UnsupportedImportError(specifier, from, supported);
			return module;
		};
	}

	function load(path: string): unknown {
		const cached = cache.get(path);
		if (cached) return cached.exports;
		const module = {exports: {} as unknown};
		cache.set(path, module);
		// `sourceURL` names the file in a stack trace, so an error thrown by a script points at
		// `deploy/01_deploy_counter.ts` rather than at an anonymous function.
		const evaluate = new Function('exports', 'require', 'module', `${files[path]}\n//# sourceURL=project:///${path}`);
		try {
			evaluate(module.exports, requireFrom(path), module);
		} catch (error) {
			cache.delete(path);
			throw error;
		}
		return module.exports;
	}

	return {
		supported,
		load(path: string): unknown {
			if (!(path in files)) throw new Error(`no project file ${path}`);
			return load(path);
		},
	};
}
