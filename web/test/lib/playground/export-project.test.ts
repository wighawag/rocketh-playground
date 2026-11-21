/**
 * The project a reader downloads, unzipped as they would: a hardhat-deploy project with the
 * reader's files, published versions, a README naming the commands and the licence, and neither
 * the deployment records nor a test key.
 */
import {describe, it, expect} from 'vitest';
import {get} from 'svelte/store';
import {strFromU8, unzipSync} from 'fflate';
import playground from '../../../package.json';
import {
	startingProject,
	TEMPLATE_FILES,
	TEMPLATE_SOURCE,
	type ProjectFiles,
} from '../../../src/lib/playground/project/template.js';
import {
	COUNTER_TESTS,
	exportedPackageJson,
	importedPackages,
	PLAYGROUND_VERSIONS,
	PROJECT_COMMANDS,
	PROJECT_NAME,
	ZIP_NAME,
	zipProject,
} from '../../../src/lib/playground/project/export-project.js';
import {
	canDownload,
	createProjectDownload,
	downloadProject,
} from '../../../src/lib/playground/project/download.js';
import {TEST_KEYS} from '../../../src/lib/playground/runner/test-keys.js';
import {
	BARE_MODULE_NAMES,
	TYPE_ONLY_MODULES,
} from '../../../src/lib/playground/runner/bare-modules.js';

type PackageJson = Record<string, unknown> & {
	devDependencies: Record<string, string>;
};

/** The zip's files, by path relative to the project's folder. */
function unzip(zip: Uint8Array): ProjectFiles {
	const files: ProjectFiles = {};
	for (const [path, bytes] of Object.entries(unzipSync(zip))) {
		expect(path.startsWith(`${PROJECT_NAME}/`), path).toBe(true);
		files[path.slice(PROJECT_NAME.length + 1)] = strFromU8(bytes);
	}
	return files;
}

const templatePackage = JSON.parse(
	TEMPLATE_FILES['package.json'],
) as PackageJson;
const webSpecs = playground.devDependencies as Record<string, string>;
/** The playground's exact versions; `@types/node` has a range there, so the template keeps its own. */
const webVersions = Object.fromEntries(
	Object.entries(webSpecs).filter(([, spec]) => /^\d+\.\d+\.\d+$/.test(spec)),
);

/** What every export must be, whatever the reader did. */
function expectAnExport(files: ProjectFiles) {
	// no records, no generated code, no test key in any file (with or without 0x, any case)
	for (const path of Object.keys(files)) {
		expect(path.startsWith('deployments'), path).toBe(false);
		expect(path.startsWith('generated'), path).toBe(false);
	}
	const everything = Object.values(files).join('\n').toLowerCase();
	for (const key of TEST_KEYS)
		expect(everything).not.toContain(key.slice(2).toLowerCase());

	// package.json: published versions, the playground's where it pins one, nothing added
	const pkg = JSON.parse(files['package.json']) as PackageJson;
	expect(files['package.json']).not.toContain('workspace:');
	expect(Object.keys(pkg)).toEqual(Object.keys(templatePackage));
	expect(Object.keys(pkg.devDependencies)).toEqual(
		Object.keys(templatePackage.devDependencies),
	);
	expect(pkg.devDependencies['hardhat-deploy']).toBe(TEMPLATE_SOURCE.version);
	const shared = Object.keys(templatePackage.devDependencies).filter(
		(name) => name in webVersions,
	);
	expect(shared).toEqual(
		expect.arrayContaining([
			'rocketh',
			'viem',
			'typescript',
			'@rocketh/deploy',
		]),
	);
	// every package the tab runs is pinned exactly in web/package.json, and so in the export
	for (const name of [
		'rocketh',
		'viem',
		'typescript',
		'@rocketh/deploy',
		'@rocketh/proxy',
		'@rocketh/read-execute',
		'@rocketh/unknown-signer',
		'@rocketh/viem',
	]) {
		expect(pkg.devDependencies[name], name).toBe(webSpecs[name]);
	}
	if (
		'@types/node' in webSpecs &&
		!(('@types/node' as string) in webVersions)
	) {
		expect(pkg.devDependencies['@types/node']).toBe(
			templatePackage.devDependencies['@types/node'],
		);
	}
	for (const name of Object.keys(templatePackage.devDependencies)) {
		if (name === 'hardhat-deploy') continue;
		expect(pkg.devDependencies[name], name).toBe(
			name in webVersions
				? webVersions[name]
				: templatePackage.devDependencies[name],
		);
	}

	// the README: where it comes from and the commands, the licence, then the template's own
	const readme = files['README.md'];
	expect(readme.startsWith('# From the rocketh playground\n')).toBe(true);
	expect(readme).toContain(PROJECT_COMMANDS);
	expect(readme).toContain(
		'pnpm i && pnpm hardhat compile && pnpm hardhat deploy',
	);
	expect(readme).toMatch(/under the MIT licence/);
	expect(readme.endsWith(TEMPLATE_FILES['README.md'])).toBe(true);
}

describe('the downloaded project', () => {
	it('from the starting project is the template, every file of it, with published versions', () => {
		const files = unzip(zipProject(startingProject()));
		expect(Object.keys(files).sort()).toEqual(
			Object.keys(TEMPLATE_FILES).sort(),
		);
		expectAnExport(files);
		for (const path of Object.keys(TEMPLATE_FILES)) {
			if (path === 'package.json' || path === 'README.md') continue;
			expect(files[path], path).toBe(TEMPLATE_FILES[path]);
		}
		// the template's tests of an unchanged Counter are kept
		for (const path of COUNTER_TESTS)
			expect(files[path]).toBe(TEMPLATE_FILES[path]);
		expect(files['README.md']).not.toContain('are left out');
	});

	it("holds the reader's edits, never the records, and leaves out the Counter tests once Counter changed", () => {
		const counter = TEMPLATE_FILES['contracts/Counter.sol'].replace(
			/\binc\b/g,
			'increment',
		);
		const script = `${TEMPLATE_FILES['deploy/01_deploy_counter.ts']}\n// edited in the playground\n`;
		const edited: ProjectFiles = {
			...startingProject(),
			'contracts/Counter.sol': counter,
			'deploy/01_deploy_counter.ts': script,
			// records, were they ever handed in with the files
			'deployments/playground/Counter.json':
				'{"address": "0x5FbDB2315678afecb367f032d93F642f64180aa3"}',
			'deployments/playground/.chain': '{"chainId": "31337"}',
		};
		const files = unzip(zipProject(edited));
		expectAnExport(files);
		expect(files['contracts/Counter.sol']).toBe(counter);
		expect(files['deploy/01_deploy_counter.ts']).toBe(script);
		expect(files['rocketh/config.ts']).toBe(
			TEMPLATE_FILES['rocketh/config.ts'],
		);
		expect(files['rocketh/environment.ts']).toBe(
			TEMPLATE_FILES['rocketh/environment.ts'],
		);
		for (const path of COUNTER_TESTS) expect(files).not.toHaveProperty(path);
		expect(files['README.md']).toContain(
			'`contracts/Counter.t.sol` and `test/Counter.ts`) are left out',
		);
		expect(Object.keys(files).sort()).toEqual(
			Object.keys(TEMPLATE_FILES)
				.filter((p) => !(COUNTER_TESTS as readonly string[]).includes(p))
				.sort(),
		);
	});

	it('adds every package the project imports that the template lacks, at the version the playground runs', () => {
		const config = TEMPLATE_FILES['rocketh/config.ts']
			.replace(
				"import * as viemExtension from '@rocketh/viem';",
				"import * as viemExtension from '@rocketh/viem';\nimport * as routerExtension from '@rocketh/router';\nimport * as diamondExtension from '@rocketh/diamond';",
			)
			.replace(
				'...viemExtension,',
				'...viemExtension,\n\t...routerExtension,\n\t...diamondExtension,',
			);
		expect(config).toContain('...diamondExtension,');
		const files = unzip(
			zipProject({...startingProject(), 'rocketh/config.ts': config}),
		);
		const pkg = JSON.parse(files['package.json']) as PackageJson;
		// where the template keeps its rocketh packages, in order, and nothing else changed
		expect(pkg).not.toHaveProperty('dependencies');
		expect(pkg.devDependencies['@rocketh/router']).toBe(
			webSpecs['@rocketh/router'],
		);
		expect(pkg.devDependencies['@rocketh/diamond']).toBe(
			webSpecs['@rocketh/diamond'],
		);
		expect(Object.keys(pkg.devDependencies)).toEqual(
			[
				...Object.keys(templatePackage.devDependencies),
				'@rocketh/diamond',
				'@rocketh/router',
			].sort(),
		);
		const starting = JSON.parse(
			unzip(zipProject(startingProject()))['package.json'],
		) as PackageJson;
		for (const [name, spec] of Object.entries(starting.devDependencies))
			expect(pkg.devDependencies[name], name).toBe(spec);
	});

	it('reads imports of every form, by package, and adds only what the playground pins', () => {
		expect(
			importedPackages({
				'deploy/a.ts': [
					"import type {DiamondDeployOptions} from '@rocketh/diamond/types';",
					"import {\n\tdeployViaRouter,\n} from '@rocketh/router';",
					"export * from '@rocketh/web';",
					"import 'side-effect';",
					"const v = await import('viem/chains');",
					'const r = require("@scope/pkg/sub");',
					"import {x} from './local.js';",
					"import {y} from '../rocketh/deploy.js';",
					"import assert from 'node:assert';",
				].join('\n'),
				'contracts/A.sol': "import 'not-typescript/A.sol';",
			}),
		).toEqual([
			'@rocketh/diamond',
			'@rocketh/router',
			'@rocketh/web',
			'@scope/pkg',
			'side-effect',
			'viem',
		]);
		// a package the playground does not pin has no version to give: it is not added
		const script =
			"import pad from 'left-pad';\nimport {deployViaRouter} from '@rocketh/router';\n";
		const pkg = JSON.parse(
			unzip(zipProject({...startingProject(), 'deploy/02_more.ts': script}))[
				'package.json'
			],
		) as PackageJson;
		expect(pkg.devDependencies).not.toHaveProperty('left-pad');
		expect(pkg.devDependencies['@rocketh/router']).toBe(
			webSpecs['@rocketh/router'],
		);
	});

	it('can add every package the runner resolves: each is pinned exactly by the playground', () => {
		const packageOf = (s: string) =>
			s
				.split('/')
				.slice(0, s.startsWith('@') ? 2 : 1)
				.join('/');
		for (const name of [...BARE_MODULE_NAMES, ...TYPE_ONLY_MODULES])
			expect(PLAYGROUND_VERSIONS[packageOf(name)], name).toBeDefined();
	});

	it('refuses a workspace dependency no published version replaces', () => {
		const pkg = JSON.stringify({
			devDependencies: {'hardhat-deploy': 'workspace:*', other: 'workspace:^'},
		});
		expect(() => exportedPackageJson(pkg, {})).toThrow(/other@workspace:\^/);
		expect(
			JSON.parse(
				exportedPackageJson(
					JSON.stringify({
						devDependencies: {
							'hardhat-deploy': 'workspace:*',
							viem: '^2.0.0',
							x: '^1',
						},
					}),
					{viem: '2.58.0'},
				),
			),
		).toEqual({
			devDependencies: {
				'hardhat-deploy': TEMPLATE_SOURCE.version,
				viem: '2.58.0',
				x: '^1',
			},
		});
	});
});

describe('Download', () => {
	it('saves the zip under its name', async () => {
		const saved: {blob: Blob; name: string}[] = [];
		await downloadProject(startingProject(), (blob, name) =>
			saved.push({blob, name}),
		);
		expect(saved).toHaveLength(1);
		expect(saved[0].name).toBe(ZIP_NAME);
		expect(saved[0].blob.type).toBe('application/zip');
		const files = unzip(new Uint8Array(await saved[0].blob.arrayBuffer()));
		expect(files['contracts/Counter.sol']).toBe(
			TEMPLATE_FILES['contracts/Counter.sol'],
		);
	});

	it('is a store: building while the zip is made, failed with the reason when the save throws', async () => {
		const download = createProjectDownload(() => {
			throw new Error('no disk');
		});
		expect(get(download)).toEqual({status: 'idle'});
		const pressed = download.download(startingProject());
		expect(get(download).status).toBe('building');
		await pressed;
		expect(get(download)).toEqual({status: 'failed', error: 'no disk'});

		const ok = createProjectDownload(() => {});
		await ok.download(startingProject());
		expect(get(ok)).toEqual({status: 'idle'});
	});

	it('is offered once the files are open, and not while Reset replaces them', () => {
		expect(canDownload('idle')).toBe(false);
		expect(canDownload('booting')).toBe(false);
		expect(canDownload('resetting')).toBe(false);
		for (const phase of [
			'ready',
			'compiling',
			'transpiling',
			'running',
			'stopping',
			'sending',
			'failed',
		] as const)
			expect(canDownload(phase)).toBe(true);
	});
});
