/**
 * The project Download exports installs, compiles and deploys with the published packages, as
 * its README says: `pnpm i && pnpm hardhat compile && pnpm hardhat deploy` (hardhat's in-memory
 * network). It is what keeps the export from rotting as rocketh releases move.
 *
 * Not part of `pnpm test` or `pnpm verify`: it needs the network and takes minutes. Run it with
 * `pnpm test:export` from the repository root.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {
	startingProject,
	type ProjectFiles,
} from '../../src/lib/playground/project/template.js';
import {
	COUNTER_TESTS,
	PLAYGROUND_VERSIONS,
	zipProject,
	type ExportOptions,
} from '../../src/lib/playground/project/export-project.js';
import {
	exists,
	filesBelow,
	installAndDeploy,
	isolatedEnv,
	readerEnv,
	realXdg,
	unpackZip,
	writesReaching,
} from './install-export.js';

/** The starting project with Counter changed: a renamed function and a constructor argument. */
function changedCounter(): ProjectFiles {
	const files = startingProject();
	files['contracts/Counter.sol'] = `// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Counter {
  uint public x;

  event Increment(uint by);

  constructor(uint start) {
    x = start;
  }

  function increment() public {
    x++;
    emit Increment(1);
  }
}
`;
	files['deploy/01_deploy_counter.ts'] = files[
		'deploy/01_deploy_counter.ts'
	].replace(
		'artifact: artifacts.Counter,',
		'artifact: artifacts.Counter,\n\t\t\targs: [5n],',
	);
	expect(files['deploy/01_deploy_counter.ts']).toContain('args: [5n]');
	return files;
}

/**
 * The starting project with `@rocketh/router` and `@rocketh/diamond` spread into its config, which
 * the template does not depend on, and Counter deployed through a router.
 */
function routedCounter(): ProjectFiles {
	const files = startingProject();
	files['rocketh/config.ts'] = files['rocketh/config.ts']
		.replace(
			"import * as viemExtension from '@rocketh/viem';",
			"import * as viemExtension from '@rocketh/viem';\nimport * as routerExtension from '@rocketh/router';\nimport * as diamondExtension from '@rocketh/diamond';",
		)
		.replace(
			'...viemExtension,',
			'...viemExtension,\n\t...routerExtension,\n\t...diamondExtension,',
		);
	expect(files['rocketh/config.ts']).toContain('...diamondExtension,');
	files['deploy/01_deploy_counter.ts'] =
		"import {deployScript, artifacts} from '../rocketh/deploy.js';\n\n" +
		'export default deployScript(\n\tasync ({deployViaRouter, namedAccounts}) => {\n' +
		"\t\tawait deployViaRouter('Counter', {account: namedAccounts.deployer}, [{name: 'Counter', artifact: artifacts.Counter}]);\n\t},\n" +
		"\t{tags: ['Counter']},\n);\n";
	return files;
}

/** The one temporary folder: the pnpm store, the XDG folders and the projects. */
let root: string;
let env: NodeJS.ProcessEnv;
let startedAt: number;
/** The shared folders the run must not write to. */
let realStore: string;
const realHardhatCache = join(realXdg().XDG_CACHE_HOME, 'hardhat-nodejs');

/** Exports `files`, unzips the export in its own folder and runs the README's commands there. */
async function exportAndDeploy(
	name: string,
	files: ProjectFiles,
	options?: ExportOptions,
) {
	const dir = join(root, 'projects', name);
	const project = unpackZip(zipProject(files, options), dir);
	return {project, outputs: await installAndDeploy(project, env)};
}

describe('the exported project', () => {
	beforeAll(() => {
		startedAt = Date.now();
		root = mkdtempSync(join(tmpdir(), 'rocketh-playground-export-'));
		env = isolatedEnv(root);
		// the store a reader's pnpm uses, and the one this run's pnpm uses (same layout, `v<n>/`)
		const storePath = (e: NodeJS.ProcessEnv) =>
			execFileSync('pnpm', ['store', 'path'], {
				cwd: root,
				env: e,
				encoding: 'utf8',
			}).trim();
		realStore = dirname(storePath(readerEnv()));
		const isolatedStore = storePath(env);
		expect(isolatedStore.startsWith(join(root, 'pnpm-store'))).toBe(true);
		expect(realStore.startsWith(root)).toBe(false);
	});

	afterAll(() => {
		if (!root) return;
		rmSync(root, {recursive: true, force: true});
		expect(exists(root)).toBe(false);
	});

	it('installs, compiles and deploys the starting project', async () => {
		const {project} = await exportAndDeploy('starting', startingProject());
		// the Counter tests are kept, and compiled
		for (const path of COUNTER_TESTS)
			expect(exists(join(project, path)), path).toBe(true);
		expect(exists(join(project, 'artifacts'))).toBe(true);
	});

	it('installs, compiles and deploys a project whose Counter the reader changed', async () => {
		const {project} = await exportAndDeploy(
			'changed-counter',
			changedCounter(),
		);
		// the Counter tests, which would no longer match it, are left out
		for (const path of COUNTER_TESTS)
			expect(exists(join(project, path)), path).toBe(false);
		expect(exists(join(project, 'artifacts'))).toBe(true);
	});

	it('installs, compiles and deploys a project importing packages the template lacks', async () => {
		const {project, outputs} = await exportAndDeploy(
			'router-and-diamond',
			routedCounter(),
		);
		const pkg = JSON.parse(
			readFileSync(join(project, 'package.json'), 'utf8'),
		) as {devDependencies: Record<string, string>};
		for (const name of ['@rocketh/router', '@rocketh/diamond'])
			expect(pkg.devDependencies[name], name).toBe(PLAYGROUND_VERSIONS[name]);
		expect(outputs['pnpm hardhat deploy']).toContain('Counter_Router');
	});

	it('fails naming the step when the export is broken', async () => {
		await expect(
			exportAndDeploy('broken', startingProject(), {
				versions: {rocketh: '0.0.0-this-version-does-not-exist'},
			}),
		).rejects.toThrow(/^"pnpm i" failed/);
	});

	it('wrote the pnpm store and hardhat cache inside its folder, not to the shared ones', () => {
		const store = join(root, 'pnpm-store');
		const hardhatCache = join(env.XDG_CACHE_HOME!, 'hardhat-nodejs');
		expect(filesBelow(store).length).toBeGreaterThan(0);
		expect(filesBelow(hardhatCache).length).toBeGreaterThan(0);
		expect(writesReaching(store, realStore, startedAt)).toEqual([]);
		expect(writesReaching(hardhatCache, realHardhatCache, startedAt)).toEqual(
			[],
		);
	});
});
