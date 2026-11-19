// The declaration files the editor's language service needs, collected from node_modules at
// build time: what TypeScript itself reads to type a file importing every package a project may
// import, and nothing else.
//
// The compiler options are the language service's (`src/lib/playground/typescript/project-options.ts`),
// passed in, so a package resolves here the way it resolves in the tab.
//
// The vite plugin (`vite.playground.ts`) writes the result to
// `src/lib/playground/typescript/generated/declarations.json`, which the TypeScript worker fetches
// once the editor is usable; the node tests call `collectDeclarations` directly.
//
// HOW. A compiler host records every file TypeScript reads while it builds a program for an entry
// that imports each specifier: the `.d.ts` files, every `package.json` it consulted (for `exports`
// and `type`), and the lib files. Recording reads rather than walking packages is what keeps it to
// the reachable set: viem's types alone are 30 MB on disk, of which a program reads about 8.
//
// LAYOUT. pnpm keeps each package in `.pnpm/<id>/node_modules/<name>`, with its dependencies as
// symlinks beside it. A virtual file system has no symlinks, so the files are laid out the way npm
// hoists them: one copy of each package at `/node_modules/<name>/`, and a package that two
// dependents need in DIFFERENT versions (viem's abitype is not rocketh's) gets the other version
// nested under each dependent that needs it, at `/node_modules/<dependent>/node_modules/<name>/`.
// The lib files go at `/`, where `@typescript/vfs` looks for them.
import {existsSync, readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(web, 'package.json'));

const NODE_MODULES = `${sep}node_modules${sep}`;

/** `<nodeModules>/<name>/<rest>` of a real path, split at its LAST `node_modules`. */
function packageOf(realPath) {
	const i = realPath.lastIndexOf(NODE_MODULES);
	if (i < 0) return undefined;
	const nodeModules = realPath.slice(0, i + NODE_MODULES.length - 1);
	const after = realPath.slice(i + NODE_MODULES.length).split(sep);
	const nameParts = after[0].startsWith('@') ? 2 : 1;
	return {
		name: after.slice(0, nameParts).join('/'),
		nodeModules,
		dir: join(nodeModules, ...after.slice(0, nameParts)),
		rest: after.slice(nameParts).join('/'),
	};
}

/**
 * @param {{specifiers: readonly string[], compilerOptions: import('typescript').CompilerOptions}} options
 * @returns {{files: Record<string, string>, libs: Record<string, string>, packages: Record<string, {version: string, bytes: number}>}}
 */
export function collectDeclarations({specifiers, compilerOptions: options}) {
	/** @type {typeof import('typescript')} */
	const ts = require('typescript');
	const entry = join(web, '__playground_declarations_entry__.ts');
	const entryText = specifiers.map((s, i) => `import type * as m${i} from '${s}';`).join('\n');

	const host = ts.createCompilerHost(options);
	const read = new Set();
	const readFile = host.readFile.bind(host);
	const fileExists = host.fileExists.bind(host);
	const getSourceFile = host.getSourceFile.bind(host);
	host.fileExists = (f) => f === entry || fileExists(f);
	host.readFile = (f) => {
		if (f === entry) return entryText;
		const text = readFile(f);
		if (text !== undefined) read.add(realpathSync(f));
		return text;
	};
	host.getSourceFile = (f, language, ...rest) => {
		if (f === entry) return ts.createSourceFile(f, entryText, language);
		if (existsSync(f)) read.add(realpathSync(f));
		return getSourceFile(f, language, ...rest);
	};
	const program = ts.createProgram([entry], options, host);
	const problems = ts
		.getPreEmitDiagnostics(program)
		.filter((d) => d.file?.fileName === entry)
		.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
	if (problems.length > 0) throw new Error(`the declarations do not resolve:\n${problems.join('\n')}`);

	const libDir = realpathSync(dirname(ts.getDefaultLibFilePath(options)));
	/** @type {Record<string, string>} */
	const libs = {};
	/** Each package directory read from, by name: usually one, two when versions differ. */
	/** @type {Map<string, Map<string, string[]>>} */
	const byName = new Map();
	for (const file of read) {
		if (dirname(file) === libDir) {
			libs[`/${file.slice(libDir.length + 1)}`] = readFileSync(file, 'utf8');
			continue;
		}
		const p = packageOf(file);
		if (!p) continue;
		const dirs = byName.get(p.name) ?? new Map();
		byName.set(p.name, dirs);
		dirs.set(p.dir, [...(dirs.get(p.dir) ?? []), p.rest]);
	}

	/** The real directory `name` resolves to from a package in `nodeModules` (pnpm's sibling symlink). */
	const resolveFrom = (nodeModules, name) => {
		const candidate = join(nodeModules, ...name.split('/'));
		return existsSync(candidate) ? realpathSync(candidate) : undefined;
	};
	/** Each package directory's own `node_modules`, where pnpm links its dependencies. */
	const nodeModulesOf = new Map();
	for (const file of read) {
		const p = packageOf(file);
		if (p) nodeModulesOf.set(p.dir, p.nodeModules);
	}

	// The hoisted copy of each package: the one the project itself resolves to (`web/node_modules`),
	// else the one most of the other packages resolve to.
	const hoisted = new Map();
	for (const [name, dirs] of byName) {
		const top = resolveFrom(join(web, 'node_modules'), name);
		if (top && dirs.has(top)) {
			hoisted.set(name, top);
			continue;
		}
		const votes = new Map([...dirs.keys()].map((d) => [d, 0]));
		for (const others of byName.values()) {
			for (const other of others.keys()) {
				const target = resolveFrom(nodeModulesOf.get(other), name);
				if (target && votes.has(target)) votes.set(target, votes.get(target) + 1);
			}
		}
		hoisted.set(name, [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
	}

	/** @type {Record<string, string>} */
	const files = {};
	/** @type {Record<string, {version: string, bytes: number}>} */
	const packages = {};
	const put = (base, dir, rests) => {
		let bytes = 0;
		for (const rest of rests) {
			const text = readFileSync(join(dir, ...rest.split('/')), 'utf8');
			files[`${base}/${rest}`] = text;
			bytes += text.length;
		}
		return bytes;
	};
	for (const [name, dirs] of byName) {
		const top = hoisted.get(name);
		const bytes = put(`/node_modules/${name}`, top, dirs.get(top));
		packages[name] = {version: JSON.parse(readFileSync(join(top, 'package.json'), 'utf8')).version, bytes};
		for (const [dir, rests] of dirs) {
			if (dir === top) continue;
			// Nest this version under every dependent that resolves to it.
			let nested = 0;
			for (const [dependent, dependentDirs] of byName) {
				for (const dependentDir of dependentDirs.keys()) {
					if (dependent === name || resolveFrom(nodeModulesOf.get(dependentDir), name) !== dir) continue;
					if (dependentDir !== hoisted.get(dependent)) {
						throw new Error(`${name}: needed by a second copy of ${dependent}, which this layout does not nest`);
					}
					put(`/node_modules/${dependent}/node_modules/${name}`, dir, rests);
					nested++;
				}
			}
			if (nested === 0) throw new Error(`${name}: ${dir} was read but no package resolves to it`);
		}
	}
	return {files, libs, packages};
}
