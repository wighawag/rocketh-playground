import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
	BUDGETS,
	checkBudgets,
	measureBuild,
	workerNames,
	type Budgets,
	type Bundle,
} from '../scripts/bundle-budgets.mjs';
import {BARE_MODULE_NAMES} from '../src/lib/playground/runner/bare-modules.js';

/**
 * `scripts/bundle-budgets.mjs` measures a build against its budgets; `pnpm verify` runs it after
 * `web:build`, since the unit tests run before there is a build. These tests run its measuring
 * and its check on a small build laid out in a temp directory the way Vite and SvelteKit lay one
 * out, and check that its budgets name what the source declares.
 */

let dir: string | undefined;
afterEach(() => {
	if (dir) rmSync(dir, {recursive: true, force: true});
	dir = undefined;
});

function write(path: string, content: string) {
	mkdirSync(dirname(path), {recursive: true});
	writeFileSync(path, content);
}

const SDK = '../node_modules/@sveltejs/kit/src/runtime';
const GEN = '.svelte-kit/generated/client-optimized';

/** A build: 4 first-load chunks sharing one, a lazy view, and the four workers with the runner's packages. */
function fixtureBuild({pageExtra = ''}: {pageExtra?: string} = {}) {
	dir = mkdtempSync(join(tmpdir(), 'bundle-budgets-'));
	const client = join(dir, 'client');
	const manifest = {
		[`${SDK}/client/entry.js`]: {
			file: '_app/immutable/entry/start.js',
			imports: ['_shared.js'],
			isEntry: true,
		},
		[`${GEN}/app.js`]: {
			file: '_app/immutable/entry/app.js',
			imports: ['_shared.js'],
			dynamicImports: [
				`${GEN}/nodes/0.js`,
				`${GEN}/nodes/1.js`,
				`${GEN}/nodes/2.js`,
			],
			isEntry: true,
		},
		[`${GEN}/nodes/0.js`]: {
			file: '_app/immutable/nodes/0.js',
			css: ['_app/immutable/assets/0.css'],
			isEntry: true,
		},
		[`${GEN}/nodes/1.js`]: {file: '_app/immutable/nodes/1.js', isEntry: true},
		[`${GEN}/nodes/2.js`]: {
			file: '_app/immutable/nodes/2.js',
			imports: ['_shared.js'],
			dynamicImports: ['src/View.svelte'],
			isEntry: true,
		},
		'_shared.js': {file: '_app/immutable/chunks/shared.js'},
		'src/View.svelte': {
			file: '_app/immutable/chunks/view.js',
			imports: ['_shared.js', '_lib.js'],
			isDynamicEntry: true,
		},
		'_lib.js': {file: '_app/immutable/chunks/lib.js'},
	};
	write(join(client, '.vite/manifest.json'), JSON.stringify(manifest));
	write(join(dir, 'app.js'), 'export const dictionary = {\n\t\t"/": [2]\n\t};');
	const files: Record<string, string> = {
		'_app/immutable/entry/start.js': 'a'.repeat(100),
		'_app/immutable/entry/app.js': 'b'.repeat(200),
		'_app/immutable/nodes/0.js': 'c'.repeat(300),
		'_app/immutable/assets/0.css': 'd'.repeat(400),
		'_app/immutable/nodes/1.js': 'e'.repeat(5000),
		'_app/immutable/nodes/2.js': 'f'.repeat(500) + pageExtra,
		'_app/immutable/chunks/shared.js': 'g'.repeat(1000),
		'_app/immutable/chunks/view.js': 'h'.repeat(2000),
		'_app/immutable/chunks/lib.js': 'i'.repeat(3000),
		'_app/immutable/workers/typescript.worker-AAA.js': `const u=new URL(\`assets/declarations-X.json\`,import.meta.url);${'j'.repeat(10)}`,
		'_app/immutable/workers/typescript.worker-AAA.js.map': 'not measured',
		'_app/immutable/workers/compiler.worker-BBB.js': 'k'.repeat(20),
		'_app/immutable/workers/evm.worker-CCC.js': `import{a}from"./chunks/evm-dep.js";${'l'.repeat(30)}`,
		'_app/immutable/workers/runner.worker-DDD.js':
			'import{a}from"./chunks/shared.js";const m={rocketh:()=>import(`./chunks/rocketh.js`).then(e=>e.t),"@rocketh/deploy":()=>import(`./chunks/deploy.js`)};',
		'_app/immutable/workers/chunks/evm-dep.js': 'm'.repeat(40),
		'_app/immutable/workers/chunks/shared.js': 'n'.repeat(50),
		'_app/immutable/workers/chunks/rocketh.js': `import{b}from"./shared.js";import{c}from"./viem.js";${'o'.repeat(60)}`,
		'_app/immutable/workers/chunks/deploy.js': `import{c}from"./viem.js";${'p'.repeat(70)}`,
		'_app/immutable/workers/chunks/viem.js': 'q'.repeat(80),
		'_app/immutable/workers/assets/declarations-X.json': '{}',
		'solc/soljson-v0.8.28.js': 'r'.repeat(90),
	};
	for (const [path, content] of Object.entries(files))
		write(join(client, path), content);
	const workersSource = [
		"new Worker(new URL('./typescript/typescript.worker.ts', import.meta.url), {type: 'module'})",
		"new Worker(new URL('./compiler/compiler.worker.ts', import.meta.url))",
		"new Worker(new URL('./evm/evm.worker.ts', import.meta.url), {type: 'module'})",
		"new Worker(new URL('./runner/runner.worker.ts', import.meta.url), {type: 'module'})",
	].join('\n');
	return measureBuild({
		client,
		generatedApp: join(dir, 'app.js'),
		workersSource,
		soljsonPath: join(client, 'solc/soljson-v0.8.28.js'),
	});
}

const raw = (bundles: Bundle[], name: string) =>
	bundles.find((b) => b.name === name)?.size.raw;

/** Budgets equal to what a build measured, as `--measure` would write them. */
function budgetsOf(bundles: Bundle[]): Budgets {
	const budgets: Budgets = {
		firstLoad: m(0),
		onDemand: {},
		workers: {},
		runnerPackages: {},
		declarations: m(0),
		soljson: m(0),
	};
	for (const b of bundles) {
		const entry = {...b.size, measured: '2026-11-20'};
		if (b.key === '') (budgets as Record<string, unknown>)[b.group] = entry;
		else (budgets[b.group] as Record<string, unknown>)[b.key] = entry;
	}
	return budgets;
}
function m(raw: number) {
	return {raw, gzip: raw, measured: '2026-11-20'};
}

describe('measuring a build', () => {
	it('measures the first load, each on-demand view, each worker, each runner package, the declarations and soljson', () => {
		const bundles = fixtureBuild();
		expect(bundles.map((b) => b.name)).toEqual([
			'first load',
			'on demand: src/View.svelte',
			'typescript worker',
			'compiler worker',
			'evm worker',
			'runner worker',
			'runner package rocketh',
			'runner package @rocketh/deploy',
			'TypeScript declarations',
			'soljson',
		]);
		// The entries, the layout (with its CSS), the root page and the chunk they share; not the error page.
		expect(raw(bundles, 'first load')).toBe(100 + 200 + 300 + 400 + 500 + 1000);
		// The view's own chunk and what it adds; the shared chunk is already loaded.
		expect(raw(bundles, 'on demand: src/View.svelte')).toBe(2000 + 3000);
		const workers = '_app/immutable/workers';
		expect(raw(bundles, 'evm worker')).toBe(
			size(`${workers}/evm.worker-CCC.js`) + 40,
		);
		expect(raw(bundles, 'runner worker')).toBe(
			size(`${workers}/runner.worker-DDD.js`) + 50,
		);
		// A package's chunk and its own imports, not what the runner already holds.
		expect(raw(bundles, 'runner package rocketh')).toBe(
			size(`${workers}/chunks/rocketh.js`) + 80,
		);
		expect(raw(bundles, 'runner package @rocketh/deploy')).toBe(
			size(`${workers}/chunks/deploy.js`) + 80,
		);
		expect(raw(bundles, 'TypeScript declarations')).toBe(2);
		expect(raw(bundles, 'soljson')).toBe(90);
		for (const b of bundles) expect(b.size.gzip).toBeGreaterThan(0);
	});
});

function size(path: string) {
	if (!dir) throw new Error('no build');
	return readFileSync(join(dir, 'client', path)).length;
}

describe('checking the budgets', () => {
	it('passes a build at its budgets', () => {
		const bundles = fixtureBuild();
		expect(checkBudgets(bundles, budgetsOf(bundles))).toEqual([]);
	});

	it('passes a bundle up to 10% over the size measured', () => {
		const budgets = budgetsOf(fixtureBuild());
		const bundles = fixtureBuild({pageExtra: 'x'.repeat(250)}); // first load 2500 -> 2750
		expect(checkBudgets(bundles, budgets)).toEqual([]);
	});

	it('fails a page that grew past its budget, naming the bundle, its size and its budget', () => {
		const budgets = budgetsOf(fixtureBuild());
		const bundles = fixtureBuild({pageExtra: 'x'.repeat(251)}); // first load 2751, budget 2750
		expect(checkBudgets(bundles, budgets)).toEqual([
			'first load: 2,751 B raw, over its budget of 2,750 B (2,500 B measured on 2026-11-20, plus 10%)',
		]);
	});

	it('fails a bundle with no budget, and a budget with no bundle', () => {
		const bundles = fixtureBuild();
		const budgets = budgetsOf(bundles);
		delete budgets.onDemand['src/View.svelte'];
		budgets.runnerPackages['viem/gone'] = m(1);
		const failures = checkBudgets(bundles, budgets);
		expect(failures).toHaveLength(2);
		expect(failures[0]).toMatch(
			/^on demand: src\/View\.svelte: 5,000 B raw, \d+ B gzip, has no budget/,
		);
		expect(failures[1]).toBe(
			'runnerPackages viem/gone: has a budget but is not in the build (remove it)',
		);
	});
});

describe('the budgets', () => {
	it('has one for each worker workers.ts creates', () => {
		const source = readFileSync(
			new URL('../src/lib/playground/workers.ts', import.meta.url),
			'utf8',
		);
		expect(Object.keys(BUDGETS.workers).sort()).toEqual(
			workerNames(source).sort(),
		);
	});

	it('has one for each package the runner loads lazily', () => {
		expect(Object.keys(BUDGETS.runnerPackages).sort()).toEqual(
			[...BARE_MODULE_NAMES].sort(),
		);
	});
});
