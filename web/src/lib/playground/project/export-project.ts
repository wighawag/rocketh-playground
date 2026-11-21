/**
 * The project a reader downloads: a hardhat-deploy project, ready for
 * `pnpm i && pnpm hardhat compile && pnpm hardhat deploy`.
 *
 * It is the template's files (`web/project-template/`, the published `hardhat-deploy init`
 * template) with the reader's files over them, and three changes: package.json's `workspace:*`
 * becomes the published hardhat-deploy version, every package the playground also pins gets the
 * playground's version (what ran in the tab is what installs), a package the project imports that
 * the template does not depend on is added at that version, and the README opens with where
 * the project comes from, the commands and its licence (MIT, the template's). The deployment
 * records are never in it (their chain only existed in the tab), nor are the test keys (the runner
 * puts them into the config at run time, `runner/compose-config.ts`; no file holds them).
 *
 * Loaded on demand, when Download is pressed (`download.ts`): it brings fflate, which a first
 * visit does not need.
 */
import {strToU8, zipSync} from 'fflate';
import playground from '../../../../package.json';
import {TEMPLATE_FILES, TEMPLATE_SOURCE, type ProjectFiles} from './template';

/** The name of the downloaded file, and of the folder it unzips to. */
export const PROJECT_NAME = 'rocketh-playground-project';
export const ZIP_NAME = `${PROJECT_NAME}.zip`;

/** The commands the README names, as the spec words them. */
export const PROJECT_COMMANDS =
	'pnpm i && pnpm hardhat compile && pnpm hardhat deploy';

/**
 * The template's tests of its Counter contract. The reader never sees them, and they call
 * Counter's functions by name, so they are left out when the reader changed `contracts/Counter.sol`:
 * `hardhat build` (what `compile` runs) also compiles Solidity tests, and a test of a Counter that
 * is no more would stop it.
 */
export const COUNTER_TESTS = [
	'contracts/Counter.t.sol',
	'test/Counter.ts',
] as const;
const COUNTER = 'contracts/Counter.sol';

/** An exact version, such as `0.26.4`: what `web/package.json` gives every package the tab runs. */
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * The versions the playground pins: `web/package.json`'s exact ones. A package it gives a range
 * (`@types/node`, a build tool's types that nothing in the tab runs) is not pinned by it, so the
 * template's range stays.
 */
export const PLAYGROUND_VERSIONS: Record<string, string> = Object.fromEntries(
	Object.entries({
		...(playground as {dependencies?: Record<string, string>}).dependencies,
		...playground.devDependencies,
	}).filter(([, spec]) => EXACT.test(spec)),
);

export type ExportOptions = {
	/** Name to version; a package of the template found here gets this version. */
	versions?: Record<string, string>;
};

const DEPENDENCY_SECTIONS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const;

/**
 * The specifiers a module names: `import ... from`, `export ... from`, `import '...'`,
 * `import('...')` and `require('...')`. Type-only imports count: the downloaded project needs the
 * package to type the file. Read from the text, not from a transpile, so Download needs nothing
 * but the files (it works in a session that failed to start, and in node).
 */
const SPECIFIER =
	/\bfrom\s*(['"])([^'"\n]+)\1|\bimport\s*(['"])([^'"\n]+)\3|\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\5\s*\)/g;

/** `@scope/name` or `name` of a bare specifier; undefined for a relative path, a `node:` builtin or a URL. */
function packageName(specifier: string): string | undefined {
	if (/^[./]/.test(specifier) || specifier.includes(':')) return undefined;
	const parts = specifier.split('/');
	return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

/** The packages the project's TypeScript and JavaScript files import, sorted. */
export function importedPackages(files: ProjectFiles): string[] {
	const names = new Set<string>();
	for (const [path, text] of Object.entries(files)) {
		if (!/\.[cm]?[jt]s$/.test(path)) continue;
		for (const m of text.matchAll(SPECIFIER)) {
			const name = packageName(m[2] ?? m[4] ?? m[6]);
			if (name) names.add(name);
		}
	}
	return [...names].sort();
}

/**
 * The template's package.json as the export ships it. Versions change, and a package in
 * `imported` that the template does not depend on is added at the version in `versions`, in the
 * section where the template keeps `rocketh` (`dependencies` if it has none), so a project that
 * uses `@rocketh/router` installs it. Nothing is removed, the template's other packages keep its
 * ranges, and an imported package `versions` has no version for is not added: the playground did
 * not run it.
 */
export function exportedPackageJson(
	text: string,
	versions: Record<string, string> = PLAYGROUND_VERSIONS,
	imported: readonly string[] = [],
): string {
	const pkg = JSON.parse(text) as Record<string, unknown>;
	const declared = new Set(
		DEPENDENCY_SECTIONS.flatMap((s) =>
			Object.keys((pkg[s] as Record<string, string> | undefined) ?? {}),
		),
	);
	const missing = imported.filter(
		(name) => !declared.has(name) && name in versions,
	);
	if (missing.length > 0) {
		const section =
			DEPENDENCY_SECTIONS.find((s) =>
				Object.hasOwn((pkg[s] as object | undefined) ?? {}, 'rocketh'),
			) ?? 'dependencies';
		const deps = {...(pkg[section] as Record<string, string> | undefined)};
		for (const name of missing) deps[name] = versions[name];
		pkg[section] = Object.fromEntries(
			Object.keys(deps)
				.sort()
				.map((name) => [name, deps[name]]),
		);
	}
	for (const section of DEPENDENCY_SECTIONS) {
		const deps = pkg[section] as Record<string, string> | undefined;
		if (!deps) continue;
		for (const [name, spec] of Object.entries(deps)) {
			if (spec.startsWith('workspace:')) {
				if (name !== TEMPLATE_SOURCE.package) {
					throw new Error(
						`the project template's package.json has ${name}@${spec}, which no published version replaces`,
					);
				}
				deps[name] = TEMPLATE_SOURCE.version;
			} else if (name in versions) {
				deps[name] = versions[name];
			}
		}
	}
	return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** The section the README opens with. */
export function readmePreamble(droppedTests: readonly string[]): string {
	const lines = [
		'# From the rocketh playground',
		'',
		'This project was downloaded from the [rocketh playground](https://play.rocketh.dev), with its contracts and deploy scripts as you left them there. It is a hardhat-deploy project: to install, compile and deploy it, run',
		'',
		'```bash',
		PROJECT_COMMANDS,
		'```',
		'',
		"The packages in `package.json` that the playground runs (rocketh and its extensions, viem, TypeScript) have the versions it ran. The playground's deployment records are not included, since their chain only existed in your browser tab, and neither are its accounts: they were throwaway test keys, given to the deploy scripts at run time.",
	];
	if (droppedTests.length > 0) {
		lines.push(
			'',
			`The template's tests of its Counter contract (${droppedTests.map((p) => `\`${p}\``).join(' and ')}) are left out because you changed \`${COUNTER}\`: they would no longer match it.`,
		);
	}
	lines.push(
		'',
		'## Licence',
		'',
		"This project is generated from the `hardhat-deploy init` template and, like it, is under the MIT licence. The rocketh playground's own code is AGPL-3.0; none of it is in this project.",
		'',
		'',
	);
	return lines.join('\n');
}

/** Whether a path is a deployment record, which the export never holds. */
const isRecord = (path: string) =>
	path === 'deployments' || path.startsWith('deployments/');

/**
 * The exported project's files, by path relative to its root: the template's, the reader's over
 * them, with package.json and the README changed as above.
 */
export function exportedProject(
	files: ProjectFiles,
	options: ExportOptions = {},
): ProjectFiles {
	const counterChanged =
		files[COUNTER] !== undefined && files[COUNTER] !== TEMPLATE_FILES[COUNTER];
	const dropped: string[] = counterChanged
		? COUNTER_TESTS.filter((p) => p in TEMPLATE_FILES && !(p in files))
		: [];
	const out: ProjectFiles = {};
	for (const [path, text] of Object.entries({...TEMPLATE_FILES, ...files})) {
		if (isRecord(path) || dropped.includes(path)) continue;
		out[path] = text;
	}
	out['package.json'] = exportedPackageJson(
		out['package.json'],
		options.versions,
		importedPackages(out),
	);
	out['README.md'] = readmePreamble(dropped) + (out['README.md'] ?? '');
	return out;
}

/** The zip: the exported project in one folder, `PROJECT_NAME/`. */
export function zipProject(
	files: ProjectFiles,
	options: ExportOptions = {},
): Uint8Array {
	const project = exportedProject(files, options);
	const entries: Record<string, Uint8Array> = {};
	for (const path of Object.keys(project).sort())
		entries[`${PROJECT_NAME}/${path}`] = strToU8(project[path]);
	return zipSync(entries, {level: 9});
}
