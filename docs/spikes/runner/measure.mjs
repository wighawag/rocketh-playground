// Drives the built spike in headless Chromium and prints what it measured, as JSON.
// Usage: pnpm build && node measure.mjs. It starts its own `vite preview` and stops it (the
// whole process group) before it exits, whatever happens.
import {spawn} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';

const port = Number(process.env.PORT ?? 4319);
const origin = `http://localhost:${port}`;

// --- bundles ----------------------------------------------------------------------------------
function sizes(file) {
	const bytes = readFileSync(file);
	return {raw: bytes.length, gzip: gzipSync(bytes).length};
}
const bundles = {};
const assets = new URL('./dist/assets/', import.meta.url).pathname;
for (const name of readdirSync(assets)) {
	const key = name.replace(/-[A-Za-z0-9_-]{8}\.js$/, '');
	bundles[key === 'index' ? 'page' : key] = sizes(assets + name);
}
const solcDir = new URL('./dist/solc/', import.meta.url).pathname;
for (const name of readdirSync(solcDir)) bundles[name] = sizes(solcDir + name);

// --- server -----------------------------------------------------------------------------------
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {stdio: 'ignore', detached: true});
const results = {bundles, runs: {}, checks: {}, problems: []};
let browser;
try {
	for (let i = 0; i < 50; i++) {
		try {
			if ((await fetch(origin)).ok) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 200));
	}
	browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning') results.problems.push(`[${m.type()}] ${m.text()}`);
	});
	page.on('pageerror', (e) => results.problems.push(`[pageerror] ${e.message}`));
	const fetched = {};
	page.on('response', async (response) => {
		try {
			const body = await response.body();
			fetched[new URL(response.url()).pathname] = body.length;
		} catch {}
	});

	const ready = async () => {
		await page.waitForFunction(() => window.spike && (window.spike.boot?.readyAt || window.spike.bootError), null, {timeout: 120000});
		const bootError = await page.evaluate(() => window.spike.bootError);
		if (bootError) throw new Error(`boot: ${bootError}`);
		// the compiler preloads in the background; wait for it so boot numbers are complete
		await page.evaluate(() => window.spike.compilerLoaded);
		return page.evaluate(() => window.spike.boot);
	};
	const deploy = (options = {}) => page.evaluate((o) => window.spike.deploy(o), options);
	const blockNumber = () => page.evaluate(() => window.spike.blockNumber());
	const counterRecord = () =>
		page.evaluate(() => {
			const r = window.spike.records()['deployments/playground/Counter.json'];
			return r ? JSON.parse(r).address : undefined;
		});
	const codeSize = (address) => page.evaluate(async (a) => ((await window.spike.getCode(a)).length - 2) / 2, address);
	const sent = (run) => run.counts?.eth_sendRawTransaction ?? 0;

	// 1. cold: a fresh context, empty storage, Deploy as soon as the page is ready
	const t0 = Date.now();
	await page.goto(`${origin}/#fresh`);
	results.runs.coldBoot = await ready();
	results.runs.coldBoot.wallToReadyMs = Date.now() - t0;
	// Deploy the moment the page is ready, without waiting for the compiler: what a reader who
	// clicks at once gets. (ready() above waited for the compiler, so this is measured separately.)
	const cold = await deploy();
	results.runs.coldDeploy = cold;
	results.fetchedCold = {...fetched};
	results.checks.coldDeployOk = cold.ok;
	results.checks.coldSent = sent(cold);
	results.checks.coldRecordFiles = await page.evaluate(() => Object.keys(window.spike.records()).sort());
	const firstAddress = await counterRecord();

	// 2. a second Deploy, nothing changed: must send nothing
	const blockBefore = await blockNumber();
	const again = await deploy();
	results.runs.secondDeploy = again;
	results.checks.secondSent = sent(again);
	results.checks.secondBlockUnchanged = (await blockNumber()) === blockBefore;
	results.checks.secondTranscriptSaysReusing = (await page.evaluate(() => window.spike.transcript().map((e) => e.text))).some((t) => t.includes('reusing'));

	// 3. edit the contract: must redeploy
	const edited = await deploy({edit: true});
	results.runs.editedDeploy = edited;
	results.checks.editedSent = sent(edited);
	const editedAddress = await counterRecord();
	results.checks.editedNewAddress = editedAddress !== firstAddress;

	// 4. reload: chain and records restored, and Deploy sends nothing
	const blockBeforeReload = await blockNumber();
	await page.reload();
	results.runs.reloadBoot = await ready();
	results.checks.reloadBlock = {before: blockBeforeReload, after: await blockNumber()};
	results.checks.reloadRecordAddress = (await counterRecord()) === editedAddress;
	results.checks.reloadCodeSize = await codeSize(editedAddress);
	const afterReload = await deploy({edit: true});
	results.runs.deployAfterReload = afterReload;
	results.checks.afterReloadSent = sent(afterReload);

	// 5. Stop during an infinite loop: the chain survives, and the next Deploy works
	await page.evaluate(() => {
		window.__looping = window.spike.deploy({edit: true, loop: true});
	});
	await page.waitForFunction(() => window.spike.transcript().some((e) => e.text === 'looping forever'), null, {timeout: 60000});
	const blockBeforeStop = await blockNumber();
	results.runs.stopMs = await page.evaluate(() => window.spike.stop());
	results.runs.loopedDeploy = await page.evaluate(() => window.__looping);
	results.checks.stopBlock = {before: blockBeforeStop, after: await blockNumber()};
	results.checks.stopCodeSize = await codeSize(editedAddress);
	const afterStop = await deploy({edit: true});
	results.runs.deployAfterStop = afterStop;
	results.checks.afterStopOk = afterStop.ok;
	results.checks.afterStopSent = sent(afterStop);

	// 6. warm: the same browser (HTTP cache warm), empty storage, first Deploy on a fresh chain
	results.transcript = await page.evaluate(() => window.spike.transcript().map((e) => `[${e.source}] ${e.text}`));
	const warmPage = await context.newPage();
	await page.close();
	await warmPage.goto(`${origin}/#fresh`);
	await warmPage.waitForFunction(() => window.spike?.boot?.readyAt, null, {timeout: 120000});
	await warmPage.evaluate(() => window.spike.compilerLoaded);
	results.runs.warmBoot = await warmPage.evaluate(() => window.spike.boot);
	const warm = await warmPage.evaluate(() => window.spike.deploy());
	results.runs.warmDeploy = warm;
	results.checks.warmSent = sent(warm);
	results.transcriptFreshDeploy = await warmPage.evaluate(() => window.spike.transcript().map((e) => `[${e.source}] ${e.text}`));

	// failures the registry and the transpiler must name (each sends nothing)
	const failing = {
		unsupportedImport: {'deploy/02_bad.ts': "import {zeroAddress} from 'viem/utils';\nimport {deployScript} from '../rocketh/deploy.js';\nexport default deployScript(async () => console.log(zeroAddress), {});\n"},
		syntaxError: {'deploy/02_bad.ts': "import {deployScript} from '../rocketh/deploy.js';\nexport default deployScript(async () => {\n\tconst x = ;\n}, {});\n"},
		touchesDocument: {'deploy/02_bad.ts': "import {deployScript} from '../rocketh/deploy.js';\nexport default deployScript(async () => {\n\tdocument.title = 'pwned';\n}, {});\n"},
		throws: {'deploy/02_bad.ts': "import {deployScript} from '../rocketh/deploy.js';\nexport default deployScript(async () => {\n\tthrow new Error('this script failed on purpose');\n}, {});\n"},
	};
	results.failures = {};
	for (const [name, files] of Object.entries(failing)) {
		const run = await warmPage.evaluate((f) => window.spike.deploy({files: f}), files);
		results.failures[name] = {ok: run.ok, stage: run.stage, errorName: run.errorName, error: run.error, sent: sent(run)};
	}

	// 7. a cold Deploy clicked AT ONCE, before the compiler has loaded (a new context: no cache)
	const fresh = await (await browser.newContext()).newPage();
	await fresh.goto(`${origin}/#fresh`);
	await fresh.waitForFunction(() => window.spike?.boot?.readyAt, null, {timeout: 120000});
	results.runs.coldDeployClickedAtOnce = await fresh.evaluate(() => window.spike.deploy());
	results.runs.coldBootClickedAtOnce = await fresh.evaluate(() => window.spike.boot);

} catch (error) {
	results.failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	process.exitCode = 1;
} finally {
	await browser?.close();
	try {
		process.kill(-server.pid);
	} catch {}
}
console.log(JSON.stringify(results, null, 2));

