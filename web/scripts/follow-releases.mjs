// Follows rocketh releases: says which of the packages the playground follows have a newer
// release on npm, and applies the bump. `.github/workflows/follow-rocketh-releases.yml` runs it
// on a schedule, then updates the lockfile, runs the tests and the export test, and opens a pull
// request a human merges. Run from `web/`:
//
//   node scripts/follow-releases.mjs [--out <dir>]
//
// WHAT IS FOLLOWED: `rocketh` and every `@rocketh/*` package `package.json` pins (each must be
// pinned exactly; a range is refused, since the playground runs one version and the export pins
// it), and `hardhat-deploy`, the starting project's release, recorded in `project-template.json`.
// `webevm` and `viem` are not followed. The version taken is the package's `latest` dist-tag,
// never one with a prerelease identifier (`2.5.0-beta.0`), and only when it is above the pinned one.
//
// WHAT IT DOES: nothing newer, nothing changes (status `nothing`). Otherwise the bump branch's name
// follows from the versions (`branchName`); when that branch already exists on `origin` a pull
// request for these versions is open or was already merged, so nothing changes either (status
// `exists`). Otherwise it pins each newer rocketh package in `package.json` and refreshes the
// starting project with `scripts/update-project-template.mjs <version>` for a newer hardhat-deploy
// (status `bumped`). The TypeScript declarations are not touched: every build regenerates them.
//
// With `--out <dir>` it writes `result.json`, `title.txt` and `body.md` (the pull request's title
// and body) there, and with `GITHUB_OUTPUT` set it adds `status` and `branch` to the step's outputs.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REGISTRY = 'https://registry.npmjs.org';
export const BRANCH_PREFIX = 'follow-releases/';
/** Above this length a branch name is shortened to a hash of the versions, still one per set. */
export const MAX_BRANCH_LENGTH = 200;

/** `x.y.z` (build metadata allowed, a prerelease identifier not): the only versions taken. */
const RELEASE = /^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/;

/** Whether `version` is a release: no prerelease identifier (`-beta.0`), no range. */
export function isRelease(version) {
	return typeof version === 'string' && RELEASE.test(version);
}

/** -1, 0 or 1 as release `a` is below, equal to or above release `b`. */
export function compareReleases(a, b) {
	const x = RELEASE.exec(a);
	const y = RELEASE.exec(b);
	if (!x || !y) throw new Error(`not a release: ${x ? b : a}`);
	for (let i = 1; i <= 3; i++) {
		const d = Number(x[i]) - Number(y[i]);
		if (d !== 0) return d < 0 ? -1 : 1;
	}
	return 0;
}

/** The rocketh packages `packageJson` pins, sorted: `rocketh` and every `@rocketh/*`. */
export function followedPackages(packageJson) {
	const deps = {...packageJson.dependencies, ...packageJson.devDependencies};
	return Object.keys(deps)
		.filter((name) => name === 'rocketh' || name.startsWith('@rocketh/'))
		.sort()
		.map((name) => ({name, version: deps[name]}));
}

/** The registry's `latest` dist-tag for `name`, through `fetchJson(url)`. */
export async function latestVersion(name, fetchJson) {
	const tags = await fetchJson(`${REGISTRY}/-/package/${name.replace('/', '%2f')}/dist-tags`);
	const latest = tags?.latest;
	if (typeof latest !== 'string') throw new Error(`${name}: the registry gives no latest dist-tag`);
	return latest;
}

/**
 * The bumps npm's answers call for, sorted by package name: `{name, from, to, file}` for each
 * followed package whose `latest` is a release above the pinned one. `file` is where the version
 * lives, `package.json` or `project-template.json`.
 */
export async function planBumps({packageJson, templateRecord, fetchJson}) {
	const followed = followedPackages(packageJson).map((p) => ({...p, file: 'package.json'}));
	for (const p of followed) {
		if (!isRelease(p.version)) throw new Error(`${p.name} is "${p.version}" in package.json; it must be pinned exactly`);
	}
	followed.push({name: templateRecord.package, version: templateRecord.version, file: 'project-template.json'});
	const bumps = [];
	for (const {name, version, file} of followed) {
		const latest = await latestVersion(name, fetchJson);
		if (isRelease(latest) && compareReleases(latest, version) > 0) bumps.push({name, from: version, to: latest, file});
	}
	return bumps.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The bump branch for `bumps`: `follow-releases/<package>-<version>-...`, sorted by package, with
 * `@rocketh/core` written `rocketh-core`. The same versions always give the same name, which is
 * how a run sees that a pull request for them already exists.
 */
export function branchName(bumps) {
	if (bumps.length === 0) throw new Error('no bumps, no branch');
	const parts = [...bumps]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map(({name, to}) => `${name.replace(/^@/, '').replace('/', '-')}-${to}`);
	const name = BRANCH_PREFIX + parts.join('-');
	if (name.length <= MAX_BRANCH_LENGTH) return name;
	const hash = createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
	return `${BRANCH_PREFIX}${bumps.length}-packages-${hash}`;
}

/** `package.json`'s text with each rocketh bump pinned, everything else as it was. */
export function pinVersions(text, bumps) {
	let out = text;
	for (const {name, from, to} of bumps) {
		const pin = `"${name}": "${from}"`;
		const count = out.split(pin).length - 1;
		if (count !== 1) throw new Error(`package.json: expected one ${pin}, found ${count}`);
		out = out.replace(pin, `"${name}": "${to}"`);
	}
	return out;
}

/** The solc versions a hardhat config's text names (`version: '0.8.28'`), each once. */
export function configSolcVersions(configText) {
	return [...new Set([...configText.matchAll(/version:\s*['"](\d+\.\d+\.\d+)['"]/g)].map((m) => m[1]))];
}

/** The pull request's title for `bumps`. */
export function pullRequestTitle(bumps) {
	return `Follow releases: ${bumps.map(({name, to}) => `${name} ${to}`).join(', ')}`;
}

/** The pull request's body: what changed, what was run, and a solc mismatch when there is one. */
export function pullRequestBody({bumps, pinnedSolc, templateSolc}) {
	const lines = [
		'Newer releases on npm, found by `.github/workflows/follow-rocketh-releases.yml` (`web/scripts/follow-releases.mjs`).',
		'',
		'| Package | From | To | Where |',
		'| --- | --- | --- | --- |',
		...bumps.map(({name, from, to, file}) => `| \`${name}\` | ${from} | ${to} | \`web/${file}\` |`),
		'',
	];
	if (bumps.some((b) => b.file === 'project-template.json')) {
		lines.push('The starting project, `web/project-template/`, was refreshed with `web/scripts/update-project-template.mjs`.', '');
	}
	const other = templateSolc.filter((v) => v !== pinnedSolc);
	if (other.length > 0) {
		lines.push(
			`**solc differs**: the starting project's \`hardhat.config.ts\` names ${templateSolc.join(', ')}, the playground ships ${pinnedSolc} (\`web/solc.json\`). The playground compiles with ${pinnedSolc} until \`web/solc.json\` is updated.`,
			'',
		);
	}
	lines.push(
		'`pnpm-lock.yaml` was updated with `pnpm install --lockfile-only`; `pnpm verify` and `pnpm test:export` passed on this change before the pull request was opened.',
	);
	return lines.join('\n') + '\n';
}

/**
 * The whole decision, on the files in `webDir`. `fetchJson(url)` asks the registry,
 * `branchExists(name)` asks `origin`, `updateTemplate(version)` refreshes the starting project.
 * Resolves to `{status, bumps, branch?, title?, body?}`; files change only for status `bumped`.
 */
export async function followReleases({webDir, fetchJson, branchExists, updateTemplate}) {
	const packagePath = join(webDir, 'package.json');
	const packageText = readFileSync(packagePath, 'utf8');
	const templateRecord = JSON.parse(readFileSync(join(webDir, 'project-template.json'), 'utf8'));
	const bumps = await planBumps({packageJson: JSON.parse(packageText), templateRecord, fetchJson});
	if (bumps.length === 0) return {status: 'nothing', bumps};
	const branch = branchName(bumps);
	if (await branchExists(branch)) return {status: 'exists', bumps, branch};

	const pins = bumps.filter((b) => b.file === 'package.json');
	if (pins.length > 0) writeFileSync(packagePath, pinVersions(packageText, pins));
	const template = bumps.find((b) => b.file === 'project-template.json');
	if (template) await updateTemplate(template.to);

	const pinnedSolc = JSON.parse(readFileSync(join(webDir, 'solc.json'), 'utf8')).version;
	const templateSolc = configSolcVersions(readFileSync(join(webDir, 'project-template/hardhat.config.ts'), 'utf8'));
	return {status: 'bumped', bumps, branch, title: pullRequestTitle(bumps), body: pullRequestBody({bumps, pinnedSolc, templateSolc})};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const webDir = fileURLToPath(new URL('..', import.meta.url));
	const outIndex = process.argv.indexOf('--out');
	const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
	const result = await followReleases({
		webDir,
		fetchJson: async (url) => {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
			return response.json();
		},
		branchExists: async (branch) =>
			execFileSync('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], {cwd: webDir, encoding: 'utf8'}).trim() !== '',
		updateTemplate: async (version) => {
			execFileSync(process.execPath, [join(webDir, 'scripts/update-project-template.mjs'), version], {cwd: webDir, stdio: 'inherit'});
		},
	});
	for (const {name, from, to} of result.bumps) console.log(`${name}: ${from} -> ${to}`);
	console.log(
		{nothing: 'nothing newer on npm', exists: `${result.branch} already exists: nothing to open`, bumped: `bumped, for ${result.branch}`}[result.status],
	);
	if (out) {
		mkdirSync(out, {recursive: true});
		writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, '\t') + '\n');
		if (result.title) writeFileSync(join(out, 'title.txt'), result.title + '\n');
		if (result.body) writeFileSync(join(out, 'body.md'), result.body);
	}
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\nbranch=${result.branch ?? ''}\n`);
	}
}
