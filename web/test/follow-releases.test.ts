import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {
	branchName,
	compareReleases,
	followReleases,
	followedPackages,
	isRelease,
	MAX_BRANCH_LENGTH,
	REGISTRY,
	type Bump,
} from '../scripts/follow-releases.mjs';
import {BARE_MODULE_NAMES} from '../src/lib/playground/runner/bare-modules.js';

/**
 * `scripts/follow-releases.mjs` decides what `.github/workflows/follow-rocketh-releases.yml` bumps.
 * These tests run it on a copy of the real `package.json`, `project-template.json`, `solc.json` and
 * starting project's `hardhat.config.ts`, with the registry, `origin` and the template refresh
 * stubbed: nothing here touches the network or git.
 */

const web = fileURLToPath(new URL('..', import.meta.url));
const realPackage = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));
const realTemplate = JSON.parse(readFileSync(join(web, 'project-template.json'), 'utf8'));
const pinnedRocketh: Record<string, string> = Object.fromEntries(followedPackages(realPackage).map((p) => [p.name, p.version]));

let dir: string | undefined;
afterEach(() => {
	if (dir) rmSync(dir, {recursive: true, force: true});
	dir = undefined;
});

function fixtureWeb() {
	dir = mkdtempSync(join(tmpdir(), 'follow-releases-'));
	for (const file of ['package.json', 'project-template.json', 'solc.json']) cpSync(join(web, file), join(dir, file));
	mkdirSync(join(dir, 'project-template'));
	cpSync(join(web, 'project-template/hardhat.config.ts'), join(dir, 'project-template/hardhat.config.ts'));
	return dir;
}

/** A tiny semver bump, for stubbing "a newer release". */
function next(version: string, part: 'patch' | 'minor' = 'patch') {
	const [major, minor, patch] = version.split('.').map(Number);
	return part === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/** The registry, answering each package's dist-tags from `latest` (the pinned versions by default). */
function registry(latest: Record<string, string> = {}, extraTags: Record<string, Record<string, string>> = {}) {
	const asked: string[] = [];
	const fetchJson = async (url: string) => {
		asked.push(url);
		const prefix = `${REGISTRY}/-/package/`;
		expect(url.startsWith(prefix) && url.endsWith('/dist-tags')).toBe(true);
		const name = decodeURIComponent(url.slice(prefix.length, -'/dist-tags'.length));
		const pinned = name === realTemplate.package ? realTemplate.version : pinnedRocketh[name];
		if (!pinned) throw new Error(`asked about ${name}, which is not followed`);
		return {next: '99.0.0-next.1', ...extraTags[name], latest: latest[name] ?? pinned};
	};
	return {fetchJson, asked};
}

function stubs({existing = [] as string[]} = {}) {
	const templateCalls: string[] = [];
	const branchesAsked: string[] = [];
	return {
		templateCalls,
		branchesAsked,
		branchExists: async (branch: string) => {
			branchesAsked.push(branch);
			return existing.includes(branch);
		},
		updateTemplate: async (version: string) => {
			templateCalls.push(version);
		},
	};
}

function read(file: string) {
	return readFileSync(join(dir!, file), 'utf8');
}

describe('what is followed', () => {
	it('is rocketh and every @rocketh/* package, never webevm or viem', () => {
		const names = followedPackages(realPackage).map((p) => p.name);
		expect(names).toContain('rocketh');
		expect(names).toContain('@rocketh/core');
		// every rocketh package the runner resolves is followed, the extensions a project spreads included
		expect(names).toContain('@rocketh/router');
		for (const name of BARE_MODULE_NAMES.filter((n) => n === 'rocketh' || n.startsWith('@rocketh/'))) expect(names, name).toContain(name);
		expect(names.every((n) => n === 'rocketh' || n.startsWith('@rocketh/'))).toBe(true);
		expect(names).not.toContain('webevm');
		expect(names).not.toContain('viem');
	});

	it('takes releases only, compared numerically', () => {
		expect(isRelease('0.26.4')).toBe(true);
		expect(isRelease('2.5.0-beta.0')).toBe(false);
		expect(isRelease('^0.26.4')).toBe(false);
		expect(compareReleases('0.10.0', '0.9.9')).toBe(1);
		expect(compareReleases('1.2.3', '1.2.3')).toBe(0);
	});
});

describe('followReleases', () => {
	it('changes nothing when nothing is newer', async () => {
		const webDir = fixtureWeb();
		const before = read('package.json');
		const {fetchJson, asked} = registry();
		const s = stubs();
		const result = await followReleases({webDir, fetchJson, ...s});
		expect(result).toEqual({status: 'nothing', bumps: []});
		expect(read('package.json')).toBe(before);
		expect(s.templateCalls).toEqual([]);
		expect(s.branchesAsked).toEqual([]);
		// Every followed package, and hardhat-deploy, was asked about.
		expect(asked.length).toBe(Object.keys(pinnedRocketh).length + 1);
	});

	it('pins a newer rocketh package exactly in package.json, and nothing else', async () => {
		const webDir = fixtureWeb();
		const before = read('package.json');
		const to = next(pinnedRocketh['@rocketh/deploy']);
		const s = stubs();
		const result = await followReleases({webDir, ...registry({'@rocketh/deploy': to}), ...s});
		expect(result.status).toBe('bumped');
		expect(result.bumps).toEqual([{name: '@rocketh/deploy', from: pinnedRocketh['@rocketh/deploy'], to, file: 'package.json'}]);
		expect(result.branch).toBe(`follow-releases/rocketh-deploy-${to}`);
		const after = read('package.json');
		expect(JSON.parse(after).devDependencies['@rocketh/deploy']).toBe(to);
		expect(after).toBe(before.replace(`"@rocketh/deploy": "${pinnedRocketh['@rocketh/deploy']}"`, `"@rocketh/deploy": "${to}"`));
		expect(s.templateCalls).toEqual([]);
		expect(result.title).toBe(`Follow releases: @rocketh/deploy ${to}`);
		expect(result.body).toContain(`| \`@rocketh/deploy\` | ${pinnedRocketh['@rocketh/deploy']} | ${to} | \`web/package.json\` |`);
		expect(result.body).not.toContain('solc differs');
	});

	it('refreshes the starting project with the newer hardhat-deploy version', async () => {
		const webDir = fixtureWeb();
		const before = read('package.json');
		const to = next(realTemplate.version, 'minor');
		const s = stubs();
		const result = await followReleases({webDir, ...registry({'hardhat-deploy': to}), ...s});
		expect(result.status).toBe('bumped');
		expect(s.templateCalls).toEqual([to]);
		expect(result.branch).toBe(`follow-releases/hardhat-deploy-${to}`);
		expect(read('package.json')).toBe(before);
		expect(result.body).toContain('was refreshed with `web/scripts/update-project-template.mjs`');
	});

	it("says so in the body when the refreshed template's solc differs from solc.json", async () => {
		const webDir = fixtureWeb();
		const to = next(realTemplate.version);
		const result = await followReleases({
			webDir,
			...registry({'hardhat-deploy': to}),
			...stubs(),
			updateTemplate: async () => {
				writeFileSync(join(webDir, 'project-template/hardhat.config.ts'), "export default {solidity: {profiles: {default: {version: '0.8.99'}}}};\n");
			},
		});
		const pinned = JSON.parse(read('solc.json')).version;
		expect(result.body).toContain('**solc differs**');
		expect(result.body).toContain(`names 0.8.99, the playground ships ${pinned}`);
	});

	it('takes the latest dist-tag, never a prerelease, and never goes down', async () => {
		const webDir = fixtureWeb();
		const before = read('package.json');
		const s = stubs();
		const result = await followReleases({
			webDir,
			...registry(
				{rocketh: `${next(pinnedRocketh.rocketh, 'minor')}-beta.0`, '@rocketh/core': '0.0.1'},
				// A newer release under another tag is not taken either: only `latest` counts.
				{'@rocketh/viem': {next: next(pinnedRocketh['@rocketh/viem'], 'minor')}},
			),
			...s,
		});
		expect(result.status).toBe('nothing');
		expect(read('package.json')).toBe(before);
	});

	it('opens nothing when the branch for the same versions exists', async () => {
		const webDir = fixtureWeb();
		const before = read('package.json');
		const to = next(pinnedRocketh.rocketh);
		const hd = next(realTemplate.version);
		const branch = `follow-releases/hardhat-deploy-${hd}-rocketh-${to}`;
		const s = stubs({existing: [branch]});
		const result = await followReleases({webDir, ...registry({rocketh: to, 'hardhat-deploy': hd}), ...s});
		expect(result).toMatchObject({status: 'exists', branch});
		expect(s.branchesAsked).toEqual([branch]);
		expect(read('package.json')).toBe(before);
		expect(s.templateCalls).toEqual([]);
	});

	it('opens a new one when only an older bump branch exists', async () => {
		const webDir = fixtureWeb();
		const to = next(next(pinnedRocketh.rocketh));
		const s = stubs({existing: [`follow-releases/rocketh-${next(pinnedRocketh.rocketh)}`]});
		const result = await followReleases({webDir, ...registry({rocketh: to}), ...s});
		expect(result).toMatchObject({status: 'bumped', branch: `follow-releases/rocketh-${to}`});
	});

	it('refuses a rocketh package that is not pinned exactly', async () => {
		const webDir = fixtureWeb();
		writeFileSync(join(webDir, 'package.json'), read('package.json').replace(`"rocketh": "${pinnedRocketh.rocketh}"`, `"rocketh": "^${pinnedRocketh.rocketh}"`));
		await expect(followReleases({webDir, ...registry(), ...stubs()})).rejects.toThrow('rocketh is "^');
	});
});

describe('branchName', () => {
	const bump = (name: string, to: string): Bump => ({name, from: '0.0.0', to, file: 'package.json'});

	it('follows from the versions alone, whatever their order', () => {
		const a = [bump('rocketh', '1.0.0'), bump('@rocketh/core', '2.0.0')];
		expect(branchName(a)).toBe('follow-releases/rocketh-core-2.0.0-rocketh-1.0.0');
		expect(branchName([...a].reverse())).toBe(branchName(a));
		expect(branchName([bump('rocketh', '1.0.1'), bump('@rocketh/core', '2.0.0')])).not.toBe(branchName(a));
	});

	it('is shortened to a hash of the versions when every package bumps at once', () => {
		const many = Array.from({length: 20}, (_, i) => bump(`@rocketh/package-${i}`, `1.${i}.0`));
		const name = branchName(many);
		expect(name.length).toBeLessThanOrEqual(MAX_BRANCH_LENGTH);
		expect(name).toMatch(/^follow-releases\/20-packages-[0-9a-f]{16}$/);
		expect(branchName([...many].reverse())).toBe(name);
		expect(branchName([...many.slice(1), bump('@rocketh/package-0', '9.9.9')])).not.toBe(name);
	});
});
