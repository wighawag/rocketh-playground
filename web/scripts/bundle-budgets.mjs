// Bundle budgets: what each part of the playground costs to load, raw and gzip, against a budget,
// so a dependency that doubles the first load fails `pnpm verify` instead of shipping. Run from
// `web/` after `pnpm build` (`pnpm verify` runs it after `web:build`):
//
//   node scripts/bundle-budgets.mjs            check every bundle against its budget
//   node scripts/bundle-budgets.mjs --measure  print the sizes as BUDGETS entries, to paste below
//
// WHAT IS MEASURED, all from `.svelte-kit/output/client`, the files the site serves:
//
// - **The first load**: the static import closure (JS and CSS) of SvelteKit's entries
//   (`client/entry.js`, `client-optimized/app.js`), the root layout's node and the root page's node
//   (`"/"` in the generated `client-optimized/app.js`), read from the client manifest
//   (`.vite/manifest.json`).
// - **Each view loaded on demand**: every `dynamicImports` target reached from the first load
//   (SvelteKit's own nodes and error template aside), as its static closure minus what the first
//   load already has. A new one with no budget fails the check.
// - **Each worker**: the four in `src/lib/playground/workers.ts`. A worker is its own build with no
//   manifest, so its entry is found by name (`_app/immutable/workers/<name>.worker-<hash>.js`) and
//   its static closure is read from the emitted files' relative imports.
// - **The runner's per-package lazy chunks** (`src/lib/playground/runner/bare-modules.ts`): each
//   `"<package>":()=>import("./chunks/...")` of the runner's entry, as its static closure minus the
//   runner's own.
// - **The TypeScript worker's declarations asset** (`workers/assets/declarations-<hash>.json`) and
//   **the shipped soljson** (`solc/<path in solc.json>`).
//
// THE BUDGETS are the sizes measured when the check landed plus 10% (`HEADROOM`). Each entry below
// is that MEASUREMENT with the date it was taken, so raising a budget is a visible, reviewed edit of
// one line: measure again (`--measure`), and replace the entry with the new size and date.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

export const HEADROOM = 1.1;

/** @param {number} raw @param {number} gzip @param {string} measured */
const m = (raw, gzip, measured) => ({raw, gzip, measured});

export const BUDGETS = {
	firstLoad: m(895667, 291466, '2026-11-20'),
	onDemand: {
		// Share's encoder (with fflate), loaded on the first press.
		'src/lib/playground/project/share-link.ts': m(12961, 6429, '2026-11-20'),
		// Download's zip (with fflate), loaded on the first press.
		'src/lib/playground/project/export-project.ts': m(
			15714,
			7710,
			'2026-11-20',
		),
		'src/lib/components/playground/Contracts.svelte': m(
			344034,
			103325,
			'2026-11-20',
		),
		'src/lib/components/playground/Transactions.svelte': m(
			332926,
			101345,
			'2026-11-20',
		),
	},
	workers: {
		typescript: m(3484391, 968786, '2026-11-20'),
		compiler: m(3443, 1576, '2026-11-20'),
		evm: m(479564, 140703, '2026-11-20'),
		runner: m(10943, 4634, '2026-11-20'),
	},
	runnerPackages: {
		rocketh: m(205181, 65497, '2026-11-20'),
		'@rocketh/deploy': m(313778, 107668, '2026-11-20'),
		'@rocketh/proxy': m(1373297, 289272, '2026-11-20'),
		'@rocketh/diamond': m(1308821, 246724, '2026-11-20'),
		'@rocketh/router': m(454246, 133056, '2026-11-21'),
		'@rocketh/read-execute': m(153728, 47756, '2026-11-20'),
		'@rocketh/viem': m(442611, 157405, '2026-11-20'),
		'@rocketh/signer': m(383572, 141559, '2026-11-20'),
		'@rocketh/unknown-signer': m(5492, 2742, '2026-11-20'),
		'@rocketh/web': m(210558, 67653, '2026-11-20'),
		viem: m(441301, 156662, '2026-11-20'),
		'viem/account-abstraction': m(478541, 144772, '2026-11-20'),
		'viem/accounts': m(381092, 140536, '2026-11-20'),
		'viem/actions': m(408966, 143568, '2026-11-20'),
		'viem/celo': m(74563, 28736, '2026-11-20'),
		'viem/chains': m(988230, 239451, '2026-11-20'),
		'viem/chains/utils': m(142550, 43546, '2026-11-20'),
		'viem/ens': m(195432, 75660, '2026-11-20'),
		'viem/experimental': m(367795, 129448, '2026-11-20'),
		'viem/experimental/erc7739': m(307205, 105901, '2026-11-20'),
		'viem/experimental/erc7811': m(11665, 4970, '2026-11-20'),
		'viem/experimental/erc7821': m(222815, 71823, '2026-11-20'),
		'viem/experimental/erc7846': m(20021, 8351, '2026-11-20'),
		'viem/experimental/erc7895': m(9747, 3871, '2026-11-20'),
		'viem/linea': m(84191, 28217, '2026-11-20'),
		'viem/nonce': m(11807, 4999, '2026-11-20'),
		'viem/op-stack': m(403617, 128079, '2026-11-20'),
		'viem/siwe': m(248826, 82253, '2026-11-20'),
		'viem/tempo': m(1068881, 290132, '2026-11-20'),
		'viem/tempo/actions': m(822511, 207664, '2026-11-20'),
		'viem/tempo/chains': m(691463, 182947, '2026-11-20'),
		'viem/tokens': m(9848, 4168, '2026-11-20'),
		'viem/utils': m(300892, 102546, '2026-11-20'),
		'viem/zksync': m(498723, 159845, '2026-11-20'),
	},
	// Raised on 2026-11-21 (from 11,906,743 / 1,169,639) for @rocketh/router: its types import
	// solidity-proxy's artifact index, which brings every one of its artifacts as a literal type.
	declarations: m(14658446, 1408184, '2026-11-21'),
	soljson: m(9169169, 6520140, '2026-11-20'),
};

const web = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------------------------
// The page, from the client manifest.

/** The static closure of `roots` in a Vite manifest: every chunk's file and CSS. */
export function manifestClosure(manifest, roots) {
	const seen = new Set();
	const files = new Set();
	const walk = (key) => {
		if (seen.has(key)) return;
		const chunk = manifest[key];
		if (!chunk) throw new Error(`the manifest has no entry ${key}`);
		seen.add(key);
		files.add(chunk.file);
		for (const css of chunk.css ?? []) files.add(css);
		for (const i of chunk.imports ?? []) walk(i);
	};
	roots.forEach(walk);
	return {keys: seen, files};
}

/** The node index of the route `/` in SvelteKit's generated `client-optimized/app.js`. */
export function rootPageNode(appSource) {
	const match = /"\/"\s*:\s*\[\s*~?(\d+)/.exec(appSource);
	if (!match) throw new Error('the generated app.js has no "/" route');
	return Number(match[1]);
}

/**
 * The first load and each on-demand closure. `rootNode` is the root page's node index.
 * @returns {{firstLoad: Set<string>, onDemand: Map<string, Set<string>>}}
 */
export function pageBundles(manifest, rootNode) {
	const isRoot = (key) =>
		key.endsWith('/client/entry.js') ||
		key.endsWith('client-optimized/app.js') ||
		key.endsWith('client-optimized/nodes/0.js') ||
		key.endsWith(`client-optimized/nodes/${rootNode}.js`);
	const roots = Object.keys(manifest).filter(isRoot);
	if (roots.length !== 4)
		throw new Error(
			`expected 4 first-load roots in the manifest, found ${roots.join(', ') || 'none'}`,
		);
	const first = manifestClosure(manifest, roots);
	const onDemand = new Map();
	for (const key of first.keys) {
		for (const target of manifest[key].dynamicImports ?? []) {
			if (
				first.keys.has(target) ||
				onDemand.has(target) ||
				target.startsWith('.svelte-kit/generated/')
			)
				continue;
			const files = manifestClosure(manifest, [target]).files;
			for (const f of first.files) files.delete(f);
			onDemand.set(target, files);
		}
	}
	return {firstLoad: first.files, onDemand};
}

// ---------------------------------------------------------------------------------------------
// The workers, from the emitted files.

// Bounded patterns over (possibly one-line, multi-MB) minified files: no unbounded repetition.
const STATIC_IMPORT =
	/\b(?:from|import)\s*(["'`])(\.{1,2}\/[^"'`\s]{1,300}?\.js)\1/g;
const DYNAMIC_IMPORT =
	/\bimport\(\s*(["'`])(\.{1,2}\/[^"'`\s]{1,300}?\.js)\1\s*\)/g;
const LAZY_PACKAGE =
	/(?:"([^"\\]{1,100})"|([A-Za-z_$][\w$]{0,100})):\(\)=>import\(\s*(["'`])(\.\/[^"'`\s]{1,300}?\.js)\3\s*\)/g;

/** Relative imports of `file` (a path under `dir`), resolved, keeping only the files that exist. */
function importsOf(dir, file, pattern) {
	const source = readFileSync(join(dir, file), 'utf8');
	const found = [];
	for (const match of source.matchAll(pattern)) {
		const resolved = posix.normalize(posix.join(posix.dirname(file), match[2]));
		if (existsSync(join(dir, resolved))) found.push(resolved);
	}
	return found;
}

/** The static closure of `entries`, files relative to `dir`, read from their relative imports. */
export function fileClosure(dir, entries) {
	const files = new Set();
	const walk = (file) => {
		if (files.has(file)) return;
		files.add(file);
		for (const i of importsOf(dir, file, STATIC_IMPORT)) walk(i);
	};
	entries.forEach(walk);
	return files;
}

/** The worker names `workers.ts` creates: `./typescript/typescript.worker.ts` is `typescript`. */
export function workerNames(workersSource) {
	const names = [
		...workersSource.matchAll(
			/new URL\(\s*'\.\/[\w/-]{0,200}?([\w-]+)\.worker\.ts'/g,
		),
	].map((m) => m[1]);
	if (names.length === 0) throw new Error('workers.ts creates no worker');
	return names;
}

/** Each package the runner's entry loads lazily, with the chunk it imports. */
export function lazyPackages(runnerSource) {
	const packages = new Map();
	for (const match of runnerSource.matchAll(LAZY_PACKAGE))
		packages.set(match[1] ?? match[2], match[4]);
	return packages;
}

/**
 * Each worker's static closure, and the runner's packages, files relative to `workersDir`.
 * @returns {{workers: Map<string, Set<string>>, runnerPackages: Map<string, Set<string>>}}
 */
export function workerBundles(workersDir, names) {
	const listing = readdirSync(workersDir);
	const workers = new Map();
	const runnerPackages = new Map();
	for (const name of names) {
		const entries = listing.filter(
			(f) => f.startsWith(`${name}.worker-`) && f.endsWith('.js'),
		);
		if (entries.length !== 1)
			throw new Error(
				`expected one ${name}.worker-<hash>.js in ${workersDir}, found ${entries.length}`,
			);
		const closure = fileClosure(workersDir, entries);
		workers.set(name, closure);
		if (name !== 'runner') continue;
		const lazy = lazyPackages(
			readFileSync(join(workersDir, entries[0]), 'utf8'),
		);
		for (const [pkg, chunk] of lazy) {
			const files = fileClosure(workersDir, [posix.normalize(chunk)]);
			for (const f of closure) files.delete(f);
			runnerPackages.set(pkg, files);
		}
	}
	return {workers, runnerPackages};
}

// ---------------------------------------------------------------------------------------------
// Sizes and the check.

/** Raw and gzip (level 9) bytes of `files` under `dir`, summed file by file. */
export function measure(dir, files) {
	let raw = 0;
	let gzip = 0;
	for (const f of files) {
		const bytes = readFileSync(join(dir, f));
		raw += bytes.length;
		gzip += gzipSync(bytes, {level: 9}).length;
	}
	return {raw, gzip};
}

/** The budget of a measurement: the size measured plus `HEADROOM`. */
export const budgetOf = (measured) => ({
	raw: Math.ceil(measured.raw * HEADROOM),
	gzip: Math.ceil(measured.gzip * HEADROOM),
});

/**
 * Every bundle of a build with its size, named for a reader.
 * @returns {{group: string, key: string, name: string, size: {raw: number, gzip: number}}[]}
 */
export function measureBuild({
	client,
	generatedApp,
	workersSource,
	soljsonPath,
}) {
	const manifest = JSON.parse(
		readFileSync(join(client, '.vite/manifest.json'), 'utf8'),
	);
	const page = pageBundles(
		manifest,
		rootPageNode(readFileSync(generatedApp, 'utf8')),
	);
	const workersDir = join(client, '_app/immutable/workers');
	const {workers, runnerPackages} = workerBundles(
		workersDir,
		workerNames(workersSource),
	);
	const declarations = readdirSync(join(workersDir, 'assets')).filter((f) =>
		/^declarations-.*\.json$/.test(f),
	);
	if (declarations.length !== 1)
		throw new Error(
			`expected one declarations-<hash>.json in ${workersDir}/assets, found ${declarations.length}`,
		);
	const bundles = [
		{
			group: 'firstLoad',
			key: '',
			name: 'first load',
			size: measure(client, page.firstLoad),
		},
	];
	for (const [key, files] of page.onDemand)
		bundles.push({
			group: 'onDemand',
			key,
			name: `on demand: ${key}`,
			size: measure(client, files),
		});
	for (const [key, files] of workers)
		bundles.push({
			group: 'workers',
			key,
			name: `${key} worker`,
			size: measure(workersDir, files),
		});
	for (const [key, files] of runnerPackages)
		bundles.push({
			group: 'runnerPackages',
			key,
			name: `runner package ${key}`,
			size: measure(workersDir, files),
		});
	bundles.push({
		group: 'declarations',
		key: '',
		name: 'TypeScript declarations',
		size: measure(join(workersDir, 'assets'), declarations),
	});
	bundles.push({
		group: 'soljson',
		key: '',
		name: 'soljson',
		size: measure(dirname(soljsonPath), [
			soljsonPath.slice(dirname(soljsonPath).length + 1),
		]),
	});
	return bundles;
}

/** The budget entry of a bundle, or undefined. */
function budgetEntry(budgets, {group, key}) {
	const entry = budgets[group];
	return key === '' ? entry : entry?.[key];
}

/**
 * What is wrong with a build against `budgets`: a bundle over its budget (raw or gzip), a bundle
 * with no budget, a budget with no bundle. Empty when the build is within its budgets.
 */
export function checkBudgets(bundles, budgets) {
	const failures = [];
	const kb = (n) => `${n.toLocaleString('en-US')} B`;
	for (const bundle of bundles) {
		const measured = budgetEntry(budgets, bundle);
		if (!measured) {
			failures.push(
				`${bundle.name}: ${kb(bundle.size.raw)} raw, ${kb(bundle.size.gzip)} gzip, has no budget (add one to scripts/bundle-budgets.mjs)`,
			);
			continue;
		}
		const budget = budgetOf(measured);
		for (const kind of ['raw', 'gzip']) {
			if (bundle.size[kind] > budget[kind]) {
				failures.push(
					`${bundle.name}: ${kb(bundle.size[kind])} ${kind}, over its budget of ${kb(budget[kind])} (${kb(measured[kind])} measured on ${measured.measured}, plus 10%)`,
				);
			}
		}
	}
	for (const group of ['onDemand', 'workers', 'runnerPackages']) {
		for (const key of Object.keys(budgets[group] ?? {})) {
			if (!bundles.some((b) => b.group === group && b.key === key))
				failures.push(
					`${group} ${key}: has a budget but is not in the build (remove it)`,
				);
		}
	}
	return failures;
}

/** The bundles as `BUDGETS`, measured `date`, for `--measure`. */
export function asBudgets(bundles, date) {
	const lines = ['export const BUDGETS = {'];
	const entry = (b) => `m(${b.size.raw}, ${b.size.gzip}, '${date}')`;
	for (const group of [
		'firstLoad',
		'onDemand',
		'workers',
		'runnerPackages',
		'declarations',
		'soljson',
	]) {
		const inGroup = bundles.filter((b) => b.group === group);
		if (inGroup.length === 1 && inGroup[0].key === '') {
			lines.push(`\t${group}: ${entry(inGroup[0])},`);
			continue;
		}
		lines.push(`\t${group}: {`);
		for (const b of inGroup)
			lines.push(`\t\t${JSON.stringify(b.key)}: ${entry(b)},`);
		lines.push('\t},');
	}
	lines.push('};');
	return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const pinned = JSON.parse(readFileSync(join(web, 'solc.json'), 'utf8'));
	const client = join(web, '.svelte-kit/output/client');
	const bundles = measureBuild({
		client,
		generatedApp: join(web, '.svelte-kit/generated/client-optimized/app.js'),
		workersSource: readFileSync(
			join(web, 'src/lib/playground/workers.ts'),
			'utf8',
		),
		soljsonPath: join(client, 'solc', pinned.path),
	});
	if (process.argv.includes('--measure')) {
		console.log(asBudgets(bundles, new Date().toISOString().slice(0, 10)));
		process.exit(0);
	}
	const failures = checkBudgets(bundles, BUDGETS);
	for (const b of bundles) {
		const measured = budgetEntry(BUDGETS, b);
		const budget = measured ? budgetOf(measured) : undefined;
		console.log(
			`${b.name}: ${b.size.raw} B raw / ${b.size.gzip} B gzip${budget ? ` (budget ${budget.raw} / ${budget.gzip})` : ''}`,
		);
	}
	if (failures.length > 0) {
		console.error(
			`\n${failures.length} bundle budget(s) exceeded or missing:\n- ${failures.join('\n- ')}`,
		);
		process.exit(1);
	}
	console.log(`\nall ${bundles.length} bundles are within their budgets`);
}
