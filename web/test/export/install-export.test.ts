/**
 * What `pnpm test:export` stands on, offline: unzipping the export, the isolated environment,
 * a failing step named in the error, and the check that the shared folders were not written.
 * The install itself needs the network, so it runs only in `pnpm test:export`.
 */
import {afterEach, describe, expect, it} from 'vitest';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {strToU8, zipSync} from 'fflate';
import {startingProject} from '../../src/lib/playground/project/template.js';
import {
	PROJECT_NAME,
	zipProject,
} from '../../src/lib/playground/project/export-project.js';
import {
	exists,
	installAndDeploy,
	isolatedEnv,
	readerEnv,
	runStep,
	unpackZip,
	writesReaching,
} from './install-export.js';

const folders: string[] = [];
function folder() {
	const dir = mkdtempSync(join(tmpdir(), 'install-export-test-'));
	folders.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of folders.splice(0))
		rmSync(dir, {recursive: true, force: true});
});

describe('unpackZip', () => {
	it('unzips the export into its one folder', () => {
		const dir = folder();
		const project = unpackZip(zipProject(startingProject()), dir);
		expect(project).toBe(join(dir, PROJECT_NAME));
		expect(readFileSync(join(project, 'contracts/Counter.sol'), 'utf8')).toBe(
			startingProject()['contracts/Counter.sol'],
		);
		expect(exists(join(project, 'package.json'))).toBe(true);
	});

	it('refuses a zip that escapes its folder or has more than one', () => {
		expect(() =>
			unpackZip(zipSync({'a/../../x': strToU8('x')}), folder()),
		).toThrow(/unsafe/);
		expect(() =>
			unpackZip(zipSync({'a/x': strToU8('x'), 'b/y': strToU8('y')}), folder()),
		).toThrow(/one folder/);
	});
});

describe('the environment', () => {
	const parent = {
		PATH: '/repo/web/node_modules/.bin:/usr/bin',
		HOME: '/home/reader',
		npm_lifecycle_event: 'test:export',
		npm_config_store_dir: '/shared/store',
		PNPM_SCRIPT_SRC_DIR: '/repo/web',
		VITEST: 'true',
		NODE_ENV: 'test',
	};

	it('is a reader shell: nothing pnpm or vitest adds to the test run', () => {
		expect(readerEnv(parent, '/repo')).toEqual({
			PATH: '/usr/bin',
			HOME: '/home/reader',
		});
	});

	it("keeps a pnpm installed outside the repository, as GitHub's runners have it, and drops the repository's own binaries", () => {
		// `pnpm/action-setup` puts pnpm in a `node_modules/.bin` of its own, outside the checkout
		const runner = {
			PATH: [
				'/home/runner/work/rocketh-playground/rocketh-playground/web/node_modules/.bin',
				'/home/runner/work/rocketh-playground/rocketh-playground/node_modules/.bin',
				'/home/runner/work/rocketh-playground/rocketh-playground/web/node_modules/.pnpm/node_modules/.bin',
				'/home/runner/setup-pnpm/node_modules/.bin',
				'/opt/hostedtoolcache/node/24.0.0/x64/bin',
				'/usr/bin',
			].join(':'),
			PNPM_HOME: '/home/runner/setup-pnpm/node_modules/.bin',
		};
		expect(
			readerEnv(runner, '/home/runner/work/rocketh-playground/rocketh-playground')
				.PATH,
		).toBe(
			'/home/runner/setup-pnpm/node_modules/.bin:/opt/hostedtoolcache/node/24.0.0/x64/bin:/usr/bin',
		);
	});

	it('does not take a folder beside the repository for one inside it', () => {
		expect(
			readerEnv({PATH: '/repo-other/node_modules/.bin:/repo/bin'}, '/repo').PATH,
		).toBe('/repo-other/node_modules/.bin');
	});

	it('puts the pnpm store and every XDG folder inside the temporary folder', () => {
		const env = isolatedEnv('/tmp/run', parent);
		expect(env.npm_config_store_dir).toBe('/tmp/run/pnpm-store');
		expect(env.pnpm_config_store_dir).toBe('/tmp/run/pnpm-store');
		for (const name of [
			'XDG_CACHE_HOME',
			'XDG_CONFIG_HOME',
			'XDG_DATA_HOME',
			'XDG_STATE_HOME',
		])
			expect(env[name]?.startsWith('/tmp/run/'), name).toBe(true);
	});
});

describe('runStep', () => {
	it('names the command that failed, with its output', async () => {
		const env = readerEnv();
		await expect(
			runStep(
				['node', '-e', 'console.error("no such version"); process.exit(3)'],
				{
					cwd: folder(),
					env,
				},
			),
		).rejects.toThrow(/^"node -e .*" failed \(exit 3\)[\s\S]*no such version/);
	});

	it('stops at the first step that fails', async () => {
		// an empty folder: `pnpm i` has no package.json to install, so `compile` never runs
		const env = isolatedEnv(folder());
		await expect(installAndDeploy(folder(), env)).rejects.toThrow(
			/^"pnpm i" failed/,
		);
	});
});

describe('writesReaching', () => {
	it('reports the files the run wrote that the shared folder also got during it', () => {
		const isolated = folder();
		const real = folder();
		for (const root of [isolated, real])
			mkdirSync(join(root, 'v11', 'files'), {recursive: true});
		for (const path of [
			'v11/files/old',
			'v11/files/new',
			'v11/files/only-here',
		])
			writeFileSync(join(isolated, path), 'x');
		writeFileSync(join(real, 'v11/files/old'), 'x');
		writeFileSync(join(real, 'v11/files/new'), 'x');
		writeFileSync(join(real, 'v11/files/someone-else'), 'x');
		const start = Date.now() - 1000;
		utimesSync(
			join(real, 'v11/files/old'),
			new Date(start - 60_000),
			new Date(start - 60_000),
		);
		expect(writesReaching(isolated, real, start)).toEqual(['v11/files/new']);
	});
});
