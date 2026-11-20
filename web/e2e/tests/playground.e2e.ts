import {test, expect, devices, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {strFromU8, unzipSync} from 'fflate';
import {PLAIN_URL} from '../ports';

/**
 * The playground in a real browser, against the production build: what only a browser can show.
 * The four workers start (one of them classic, for soljson's `importScripts`), Deploy writes the
 * records, a reload restores them with the chain and the reader's files, and Stop ends a script
 * that never yields.
 *
 * Each test gets a fresh browser context, so empty IndexedDB; a reload inside a test keeps it.
 *
 * The editor is CodeMirror: its text is typed into `.cm-content` (contenteditable), and what a
 * test starts from is read from the template on disk, the files the playground starts with.
 */

const TRANSCRIPT = '[data-testid="transcript"]';

async function ready(page: Page) {
	await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready', {timeout: 60_000});
}

async function deploy(page: Page, expected: RegExp) {
	await page.getByTestId('deploy').click();
	await expect(page.getByTestId('last-run')).toHaveText(expected, {timeout: 60_000});
	await ready(page);
}

const template = (path: string) => readFileSync(new URL(`../../project-template/${path}`, import.meta.url), 'utf8');

const DEPLOY = 'deploy/01_deploy_counter.ts';
const COUNTER = 'contracts/Counter.sol';

/** The editor's content element, which takes the keyboard. */
const editor = (page: Page) => page.locator('[data-testid="editor"] .cm-content');

async function editFile(page: Page, path: string, text: string) {
	await page.locator(`[data-testid="project-files"] [data-path="${path}"]`).click();
	await expect(editor(page)).toHaveAttribute('aria-label', path);
	await editor(page).fill(text);
}

/** The editor once the language service has attached: diagnostics, completion and hover. */
async function typed(page: Page) {
	await expect(page.locator('[data-testid="editor"] .cm-editor')).toHaveAttribute('data-language-service', 'attached', {timeout: 60_000});
}

test('Deploy writes the records, a second Deploy sends nothing, and a reload restores both', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');

	await deploy(page, /^1 transaction sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('- Executing 01_deploy_counter.ts');
	await expect(page.getByTestId('compiler')).toHaveAttribute('data-status', 'ready');
	const records = page.getByTestId('record-files');
	await expect(records.locator('[data-path="deployments/playground/Counter.json"]')).toBeVisible();
	await expect(records.locator('[data-path="deployments/playground/.chain"]')).toBeVisible();
	await records.locator('[data-path="deployments/playground/Counter.json"]').click();
	await expect(page.getByTestId('record')).toContainText('"address"');

	await deploy(page, /^Up to date: nothing sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('reusing "Counter"');

	await page.reload();
	await ready(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
	await expect(records.locator('[data-path="deployments/playground/Counter.json"]')).toBeVisible();
	await deploy(page, /^Up to date: nothing sent$/);
});

/** What the page has saved of the project, read from its IndexedDB database. */
function savedFile(page: Page, path: string) {
	return page.evaluate(
		(path) =>
			new Promise<string | undefined>((resolve, reject) => {
				const open = indexedDB.open('rocketh-playground-files');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('project')) return (db.close(), resolve(undefined));
					const get = db.transaction('project').objectStore('project').get('files');
					get.onsuccess = () => (db.close(), resolve((get.result as Record<string, string> | undefined)?.[path]));
					get.onerror = () => reject(get.error);
				};
			}),
		path,
	);
}

test('edits to a script and a contract, and the selected file, are still there after a reload, typed and compiled', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	// Counter takes a start value; the script passes a number where viem's types want a bigint
	const script = template(DEPLOY).replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],');
	const counter = template(COUNTER).replace('uint public x;', 'uint public x;\n\n  constructor(uint start) {\n    x = start;\n  }');
	await editFile(page, DEPLOY, script);
	await editFile(page, COUNTER, counter);
	// each edit is written as it is made; wait for the last one to reach storage before reloading
	await expect.poll(() => savedFile(page, COUNTER)).toBe(counter);

	await page.reload();
	await expect(editor(page)).toHaveAttribute('aria-label', COUNTER);
	await expect(editor(page)).toContainText('constructor(uint start)');
	await ready(page);
	await page.locator(`[data-testid="project-files"] [data-path="${DEPLOY}"]`).click();
	await expect(editor(page)).toContainText('args: [1],');
	// typed from the saved script and the saved contract's types: the one error is the number
	await typed(page);
	const flagged = page.locator('[data-testid="editor"] .cm-lintRange-error');
	await expect(flagged).toHaveText('1', {timeout: 30_000});
	await flagged.hover();
	await expect(page.locator('.cm-tooltip-hover, .cm-tooltip-lint').first()).toContainText("Type 'number' is not assignable to type 'bigint'.");
	await deploy(page, /^1 transaction sent$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
});

test('Stop ends a script that never yields, and the chain is still there', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await deploy(page, /^1 transaction sent$/);

	const original = template(DEPLOY);
	await editFile(
		page,
		'deploy/01_deploy_counter.ts',
		original.replace('\t},\n\t{tags', "\t\tconsole.log('looping forever');\n\t\twhile (true) {}\n\t},\n\t{tags"),
	);
	await page.getByTestId('deploy').click();
	await expect(page.locator(TRANSCRIPT)).toContainText('looping forever', {timeout: 60_000});
	await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'running');
	// a Reset now could let the run land on the fresh chain
	await expect(page.getByTestId('reset')).toBeDisabled();
	await page.getByTestId('stop').click();
	await expect(page.getByTestId('last-run')).toHaveText('Stopped');
	await ready(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');

	await editFile(page, 'deploy/01_deploy_counter.ts', original);
	await deploy(page, /^Up to date: nothing sent$/);
});

test('a script touching the page gets a ReferenceError, and nothing is sent', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	const original = template(DEPLOY);
	await editFile(page, 'deploy/01_deploy_counter.ts', original.replace('async ({deploy, namedAccounts}) => {', "async ({deploy, namedAccounts}) => {\n\t\tdocument.title = 'from a script';"));
	await deploy(page, /^The run failed$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('document is not defined');
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	expect(await page.title()).not.toBe('from a script');
});

test("a hardhat-deploy v1 deploy script fails with rocketh's error, then a line linking the migration guide, which the header links too", async ({page}) => {
	const GUIDE = 'https://rocketh.dev/hardhat-deploy/migration/';
	await page.goto(PLAIN_URL);
	await expect(page.getByTestId('migration-guide')).toHaveAttribute('href', GUIDE);
	await expect(page.getByTestId('migration-guide')).toHaveAttribute('target', '_blank');
	await ready(page);
	await expect(page.getByTestId('migration-guide')).toHaveText('Migrating from hardhat-deploy v1?');
	await editFile(
		page,
		DEPLOY,
		[
			"import {HardhatRuntimeEnvironment} from 'hardhat/types';",
			"import {DeployFunction} from 'hardhat-deploy/types';",
			'',
			'const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {',
			'const {deployments, getNamedAccounts} = hre;',
			'const {deploy} = deployments;',
			'const {deployer} = await getNamedAccounts();',
			"await deploy('Counter', {from: deployer, log: true});",
			'};',
			'export default func;',
			"func.tags = ['Counter'];",
		].join('\n'),
	);
	await deploy(page, /^The run failed$/);
	const lines = page.locator(`${TRANSCRIPT} li`);
	await expect(lines.nth(-2)).toHaveText('getNamedAccounts is not a function');
	await expect(lines.nth(-1)).toContainText('This looks like a hardhat-deploy v1 deploy script');
	await expect(lines.nth(-1).getByTestId('transcript-link')).toHaveAttribute('href', GUIDE);
	await expect(lines.nth(-1).getByTestId('transcript-link')).toHaveAttribute('target', '_blank');
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
});

test('a Solidity error is shown with its file and line, and nothing is sent', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await editFile(page, COUNTER, template(COUNTER).replace('x++;', 'x++'));
	await deploy(page, /^Nothing was sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('contracts/Counter.sol:11:');
});

test('the editor is usable at once, then typed: a wrong constructor argument is flagged, and Deploy still runs', async ({page}) => {
	// every editor view the page creates, in order: syntax only first, the language service after
	await page.addInitScript(() => {
		const views: string[] = ((window as unknown as {views: string[]}).views = []);
		new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('cm-editor')) views.push(n.dataset.languageService ?? '');
		}).observe(document, {subtree: true, childList: true});
	});
	await page.goto(PLAIN_URL);
	await expect(editor(page)).toHaveAttribute('aria-label', DEPLOY);
	await expect(editor(page)).toContainText('deployScript(');
	await typed(page);
	expect(await page.evaluate(() => (window as unknown as {views: string[]}).views)).toEqual(['syntax', 'attached']);
	const [usable, attached] = await page.evaluate(() =>
		['playground:editor-usable', 'playground:language-service-attached'].map((name) => performance.getEntriesByName(name)[0]?.startTime),
	);
	expect(usable).toBeLessThan(attached);
	// the starting project has no type error
	await expect(page.locator('[data-testid="editor"] .cm-lintRange-error')).toHaveCount(0);

	// Counter takes a start value; the script passes a number where viem's types want a bigint
	await editFile(page, COUNTER, template(COUNTER).replace('uint public x;', 'uint public x;\n\n  constructor(uint start) {\n    x = start;\n  }'));
	await editFile(page, DEPLOY, template(DEPLOY).replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],'));
	const flagged = page.locator('[data-testid="editor"] .cm-lintRange-error');
	await expect(flagged).toHaveText('1', {timeout: 30_000});
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	await flagged.hover();
	await expect(page.locator('.cm-tooltip-hover, .cm-tooltip-lint').first()).toContainText("Type 'number' is not assignable to type 'bigint'.");

	// a type error never blocks a run, and viem encodes the number 1 as a uint256 at run time
	await ready(page);
	await deploy(page, /^1 transaction sent$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
});

test('a misspelled deploy option is flagged, and the run goes ahead with it', async ({page}) => {
	await page.goto(PLAIN_URL);
	await typed(page);
	await editFile(page, DEPLOY, template(DEPLOY).replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\tconfirmatons: 1,'));
	await expect(page.locator('[data-testid="editor"] .cm-lintRange-error')).toHaveText('confirmatons', {timeout: 30_000});
	await ready(page);
	await deploy(page, /^1 transaction sent$/);
});

test('switching files keeps what was typed in each', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await editFile(page, DEPLOY, template(DEPLOY).replace('const {deployer} = namedAccounts;', "const {deployer} = namedAccounts;\n\t\tconsole.log('edited in the editor');"));
	await editFile(page, COUNTER, template(COUNTER).replace('uint public x;', 'uint public x;\n  uint public y;'));
	await page.locator(`[data-testid="project-files"] [data-path="${DEPLOY}"]`).click();
	await expect(editor(page)).toContainText("console.log('edited in the editor');");
	await page.locator(`[data-testid="project-files"] [data-path="${COUNTER}"]`).click();
	await expect(editor(page)).toContainText('uint public y;');
	await deploy(page, /^1 transaction sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('edited in the editor');
});

/** A function's card on the Contracts view. */
const card = (page: Page, name: string) => page.locator(`[data-testid="function"][data-function="${name}"]`);

async function openContract(page: Page, name: string) {
	await page.locator(`[data-testid="contract-list"] [data-contract="${name}"]`).click();
	await expect(page.getByTestId('contract-name')).toHaveText(name, {timeout: 30_000});
}

async function send(page: Page, name: string, args: Record<string, string> = {}) {
	await page.getByTestId('tab-write').click();
	for (const [label, value] of Object.entries(args)) await card(page, name).getByLabel(label).fill(value);
	await card(page, name).getByTestId('call').click();
}

async function read(page: Page, name: string) {
	await page.getByTestId('tab-read').click();
	await card(page, name).getByTestId('call').click();
	return card(page, name).getByTestId('call-result');
}

test('the Contracts view reads and calls Counter, from the deployer or the admin, and a Deploy after still sends nothing', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await expect(page.getByTestId('contract-list')).toContainText('Deploy to read and call your contracts.');
	await deploy(page, /^1 transaction sent$/);
	await page.locator('[data-testid="record-files"] [data-path="deployments/playground/Counter.json"]').click();
	const record = JSON.parse((await page.getByTestId('record').textContent())!);
	await openContract(page, 'Counter');
	await expect(page.getByTestId('contract-address')).toHaveText(record.address);
	// the config's names, as the run reported them, the deployer first
	await expect(page.getByTestId('send-from')).toHaveValue('0');
	await expect(page.getByTestId('send-from').locator('option')).toHaveText(['deployer (0xf39F...2266)', 'admin (0x7099...79C8)', /^account 2 \(/, /^account 3 \(/, /^account 4 \(/]);

	await send(page, 'inc');
	const mined = card(page, 'inc').getByTestId('call-transaction');
	await expect(mined).toHaveAttribute('data-status', 'success');
	await expect(mined).toContainText('Transaction mined in block 2');
	await expect(mined).toContainText('from deployer');
	await expect(card(page, 'inc').getByTestId('tx-hash')).toHaveText(/^0x[0-9a-f]{64}$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 2');
	await expect(await read(page, 'x')).toHaveText('"1"');

	await send(page, 'incBy', {by: '0'});
	await expect(card(page, 'incBy').getByTestId('call-error')).toHaveText('reverted: incBy: increment should be positive');
	await expect(page.getByTestId('block')).toHaveText('chain at block 2');

	await page.getByTestId('send-from').selectOption({label: 'admin (0x7099...79C8)'});
	await send(page, 'inc');
	await expect(card(page, 'inc').getByTestId('call-transaction')).toContainText('from admin');
	await expect(page.getByTestId('block')).toHaveText('chain at block 3');
	await expect(await read(page, 'x')).toHaveText('"2"');

	await deploy(page, /^Up to date: nothing sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('reusing "Counter"');
	await expect(page.getByTestId('block')).toHaveText('chain at block 3');
});

test('the Contracts view follows a redeploy, and stays usable after a failed run', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await deploy(page, /^1 transaction sent$/);
	await openContract(page, 'Counter');
	const first = await page.getByTestId('contract-address').textContent();

	await editFile(page, COUNTER, template(COUNTER).replace('uint public x;', 'uint public x;\n  uint public y;'));
	await deploy(page, /^1 transaction sent$/);
	await openContract(page, 'Counter');
	await expect(page.getByTestId('contract-address')).not.toHaveText(first!);
	await page.getByTestId('tab-read').click();
	await expect(card(page, 'y')).toBeVisible();

	await editFile(page, DEPLOY, template(DEPLOY).replace('async ({deploy, namedAccounts}) => {', "async ({deploy, namedAccounts}) => {\n\t\tthrow new Error('failed on purpose');"));
	await deploy(page, /^The run failed$/);
	await openContract(page, 'Counter');
	await send(page, 'inc');
	await expect(card(page, 'inc').getByTestId('call-transaction')).toHaveAttribute('data-status', 'success');
	await expect(await read(page, 'y')).toHaveText('"0"');
});

/** The Transactions view's rows, newest first. */
const rows = (page: Page) => page.locator('[data-testid="transaction"]');

async function openTransactions(page: Page) {
	await page.getByTestId('open-transactions').click();
	await expect(page.getByTestId('transactions')).toBeVisible({timeout: 30_000});
}

test('the Transactions view lists the deployment and a call from the Contracts view, decoded, and keeps them over a reload', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await openTransactions(page);
	await expect(page.getByTestId('transactions')).toContainText('No transactions yet');

	// shown while Deploy runs, it is current once the run is done
	await deploy(page, /^1 transaction sent$/);
	await expect(rows(page)).toHaveCount(1);
	const deployment = rows(page).first();
	await expect(deployment).toHaveAttribute('data-kind', 'deployment');
	await expect(deployment.getByTestId('tx-title')).toHaveText('Deploy Counter');
	await expect(deployment.getByTestId('tx-from')).toContainText('deployer');
	await expect(deployment.getByTestId('tx-created')).toContainText('Counter');
	await expect(deployment.getByTestId('tx-block')).toHaveText('1');

	await openContract(page, 'Counter');
	await send(page, 'inc');
	await expect(card(page, 'inc').getByTestId('call-transaction')).toHaveAttribute('data-status', 'success');
	const hash = await card(page, 'inc').getByTestId('tx-hash').textContent();
	await openTransactions(page);
	await expect(rows(page)).toHaveCount(2);
	const call = rows(page).first();
	await expect(call).toHaveAttribute('data-hash', hash!);
	await expect(call).toHaveAttribute('data-status', 'success');
	await expect(call.getByTestId('tx-title')).toHaveText('Counter.inc');
	await expect(call.getByTestId('tx-from')).toContainText('deployer');
	await expect(call.getByTestId('tx-to')).toContainText('Counter');
	await expect(call.getByTestId('tx-event')).toHaveText(/^Increment\(by: 1\)\s*from Counter$/);
	await expect(call.getByTestId('tx-block')).toHaveText('2');

	// a Deploy that sends nothing adds nothing
	await deploy(page, /^Up to date: nothing sent$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 2');
	await expect(rows(page)).toHaveCount(2);

	// the chain is persisted: after a reload the list is read again from it. The names come from
	// the config, which only a run evaluates, so until one runs the deployer is "account 0".
	await page.reload();
	await ready(page);
	await openTransactions(page);
	await expect(rows(page)).toHaveCount(2);
	await expect(rows(page).first()).toHaveAttribute('data-hash', hash!);
	await expect(rows(page).first().getByTestId('tx-title')).toHaveText('Counter.inc');
	await expect(rows(page).first().getByTestId('tx-from')).toContainText('account 0');
	await deploy(page, /^Up to date: nothing sent$/);
	await expect(rows(page).first().getByTestId('tx-from')).toContainText('deployer');
	await expect(rows(page)).toHaveCount(2);
	await page.getByTestId('transactions').screenshot({path: test.info().outputPath('transactions.png')});
});

test('Reset, once confirmed, gives the starting project on a fresh chain with no records, and a reload keeps it', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await deploy(page, /^1 transaction sent$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
	// edits the language service flags: the script passes a number where viem's types want a bigint
	const script = template(DEPLOY).replace('artifact: artifacts.Counter,', 'artifact: artifacts.Counter,\n\t\t\targs: [1],');
	const counter = template(COUNTER).replace('uint public x;', 'uint public x;\n\n  constructor(uint start) {\n    x = start;\n  }');
	await editFile(page, COUNTER, counter);
	await editFile(page, DEPLOY, script);
	await typed(page);
	const flagged = page.locator('[data-testid="editor"] .cm-lintRange-error');
	await expect(flagged).toHaveText('1', {timeout: 30_000});
	await openContract(page, 'Counter');

	// cancelled: nothing changes
	await page.getByTestId('reset').click();
	await expect(page.getByTestId('reset-dialog')).toBeVisible();
	await page.getByTestId('reset-cancel').click();
	await expect(page.getByTestId('reset-dialog')).toBeHidden();
	await expect(page.getByTestId('contract-name')).toHaveText('Counter');
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
	await page.locator(`[data-testid="project-files"] [data-path="${DEPLOY}"]`).click();
	await expect(editor(page)).toContainText('args: [1],');
	await openContract(page, 'Counter');

	// confirmed: the starting files, block 0, no records, the Contracts view closed
	await page.getByTestId('reset').click();
	await page.getByTestId('reset-confirm').click();
	await expect(page.getByTestId('contracts')).toBeHidden();
	await ready(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	await expect(page.getByTestId('record-files')).toHaveText('None yet: press Deploy.');
	await expect(page.getByTestId('last-run')).toBeHidden();
	await expect(page.locator(TRANSCRIPT)).toContainText('Reset: the starting project, a new chain at block 0 and no deployment records.');
	await expect(editor(page)).toHaveAttribute('aria-label', DEPLOY);
	await expect(editor(page)).not.toContainText('args: [1],');
	await expect(flagged).toHaveCount(0, {timeout: 30_000});
	await page.locator(`[data-testid="project-files"] [data-path="${COUNTER}"]`).click();
	await expect(editor(page)).not.toContainText('constructor(uint start)');

	// a reload opens what Reset saved
	await page.reload();
	await ready(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	await expect(page.getByTestId('record-files')).toHaveText('None yet: press Deploy.');
	await expect(editor(page)).toHaveAttribute('aria-label', DEPLOY);
	await expect(editor(page)).not.toContainText('args: [1],');
	await deploy(page, /^1 transaction sent$/);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
});

test("Download saves a hardhat-deploy project zip holding the reader's edit, without the records", async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await deploy(page, /^1 transaction sent$/);
	const script = `${template(DEPLOY)}\n// edited before Download\n`;
	await editFile(page, DEPLOY, script);

	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]);
	expect(download.suggestedFilename()).toBe('rocketh-playground-project.zip');
	const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
	const file = (path: string) => (zip[`rocketh-playground-project/${path}`] ? strFromU8(zip[`rocketh-playground-project/${path}`]) : undefined);
	expect(file(DEPLOY)).toContain('// edited before Download');
	expect(file(COUNTER)).toBe(template(COUNTER));
	expect(file('README.md')).toContain('pnpm i && pnpm hardhat compile && pnpm hardhat deploy');
	expect(file('package.json')).not.toContain('workspace:');
	expect(Object.keys(zip).some((path) => path.includes('/deployments/'))).toBe(false);
	await expect(page.getByTestId('download-error')).toBeHidden();
});

/** A deploy script that says so in the transcript when it runs. */
const LOUD_SCRIPT = template(DEPLOY).replace('const {deployer} = namedAccounts;', "const {deployer} = namedAccounts;\n\t\tconsole.log('the shared script ran');");

/** Share the project and read the link Share shows. */
async function share(page: Page): Promise<string> {
	await page.getByTestId('share').click();
	const field = page.getByTestId('share-link');
	await expect(field).toBeVisible();
	const link = await field.inputValue();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('share-dialog')).toBeHidden();
	return link;
}

async function noProjectKeyInURL(page: Page) {
	await expect.poll(() => new URL(page.url()).hash).not.toContain('project=');
}

test('Share gives a link that opens the same files in a fresh browser on a chain at block 0, and nothing runs until Deploy', async ({page, browser}) => {
	expect(LOUD_SCRIPT).toContain("console.log('the shared script ran');");
	await page.goto(PLAIN_URL);
	await ready(page);
	await editFile(page, DEPLOY, LOUD_SCRIPT);
	const link = await share(page);
	expect(new URL(link).hash).toMatch(/^#project=1\.[A-Za-z0-9_-]+$/);

	// a fresh context: no saved project, so it opens without asking
	const context = await browser.newContext();
	const opened = await context.newPage();
	await opened.goto(link);
	await expect(opened.locator(TRANSCRIPT)).toContainText('Opened the shared project', {timeout: 60_000});
	await ready(opened);
	await expect(opened.getByTestId('link-dialog')).toBeHidden();
	await expect(opened.getByTestId('block')).toHaveText('chain at block 0');
	await expect(opened.getByTestId('record-files')).toHaveText('None yet: press Deploy.');
	await expect(editor(opened)).toHaveAttribute('aria-label', DEPLOY);
	await expect(editor(opened)).toContainText("console.log('the shared script ran');");
	await expect(opened.locator(TRANSCRIPT)).not.toContainText('the shared script ran');
	await expect(opened.getByTestId('last-run')).toBeHidden();
	await noProjectKeyInURL(opened);

	// the reader edits it; a reload shows their edit, not the link again
	await editFile(opened, COUNTER, `${template(COUNTER)}\n// edited after opening the link\n`);
	await expect.poll(() => savedFile(opened, COUNTER)).toContain('// edited after opening the link');
	await opened.reload();
	await ready(opened);
	await expect(opened.locator(TRANSCRIPT)).not.toContainText('Opened the shared project');
	await opened.locator(`[data-testid="project-files"] [data-path="${COUNTER}"]`).click();
	await expect(editor(opened)).toContainText('// edited after opening the link');

	// Deploy is what runs it
	await deploy(opened, /^1 transaction sent$/);
	await expect(opened.locator(TRANSCRIPT)).toContainText('the shared script ran');
	await context.close();
});

test("a link over the reader's own project asks first: Cancel keeps it, Open (after a Download) replaces it on a fresh chain", async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await editFile(page, DEPLOY, LOUD_SCRIPT);
	const link = await share(page);
	// the reader's own project: deployed, then edited
	await editFile(page, DEPLOY, template(DEPLOY));
	await deploy(page, /^1 transaction sent$/);
	const mine = `${template(COUNTER)}\n// mine\n`;
	await editFile(page, COUNTER, mine);
	await expect.poll(() => savedFile(page, COUNTER)).toBe(mine);

	// a new document, not a fragment change within this one
	await page.goto('about:blank');
	await page.goto(link);
	await expect(page.getByTestId('link-dialog')).toBeVisible({timeout: 60_000});
	await page.getByTestId('link-cancel').click();
	await expect(page.getByTestId('link-dialog')).toBeHidden();
	await noProjectKeyInURL(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 1');
	await expect(page.getByTestId('record-files').locator('[data-path="deployments/playground/Counter.json"]')).toBeVisible();
	await page.locator(`[data-testid="project-files"] [data-path="${COUNTER}"]`).click();
	await expect(editor(page)).toContainText('// mine');
	await page.locator(`[data-testid="project-files"] [data-path="${DEPLOY}"]`).click();
	await expect(editor(page)).not.toContainText('the shared script ran');

	await page.goto('about:blank');
	await page.goto(link);
	await expect(page.getByTestId('link-dialog')).toBeVisible({timeout: 60_000});
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('link-download').click()]);
	const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
	expect(strFromU8(zip[`rocketh-playground-project/${COUNTER}`])).toContain('// mine');
	await page.getByTestId('link-open').click();
	await expect(page.getByTestId('link-dialog')).toBeHidden();
	await expect(page.locator(TRANSCRIPT)).toContainText('Opened the shared project', {timeout: 60_000});
	await ready(page);
	await noProjectKeyInURL(page);
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	await expect(page.getByTestId('record-files')).toHaveText('None yet: press Deploy.');
	await expect(editor(page)).toHaveAttribute('aria-label', DEPLOY);
	await expect(editor(page)).toContainText("console.log('the shared script ran');");
	await page.locator(`[data-testid="project-files"] [data-path="${COUNTER}"]`).click();
	await expect(editor(page)).not.toContainText('// mine');
	await expect(page.locator(TRANSCRIPT)).not.toContainText('the shared script ran');
});

test('a corrupted link is reported and loads nothing', async ({page}) => {
	await page.goto(`${PLAIN_URL}/#project=1.notaproject`);
	await expect(page.getByTestId('link-error')).toContainText('The shared link could not be opened: it is corrupted or cut short.');
	await ready(page);
	await noProjectKeyInURL(page);
	await expect(page.getByTestId('link-dialog')).toBeHidden();
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	await expect(editor(page)).toHaveAttribute('aria-label', DEPLOY);
	await expect(page.locator(TRANSCRIPT)).not.toContainText('Opened the shared project');
	await expect(page.locator('[data-testid="project-files"] [data-path]')).toHaveCount(4);
	await expect(editor(page)).toContainText('artifact: artifacts.Counter,');
});

test('a project too big for a link gets none, and Share offers Download instead', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	// about 47 KB of fragment once deflated (4.7 bits a letter) and base64-encoded
	let noise = '';
	let seed = 2463534242;
	while (noise.length < 60_000) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		noise += String.fromCharCode(97 + ((seed >>> 0) % 26));
	}
	await editFile(page, COUNTER, `${template(COUNTER)}\n// ${noise}\n`);
	await page.getByTestId('share').click();
	await expect(page.getByTestId('share-too-big')).toContainText('This project is too big for a link');
	await expect(page.getByTestId('share-link')).toBeHidden();
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-download').click()]);
	expect(download.suggestedFilename()).toBe('rocketh-playground-project.zip');
});

test.describe('on a phone', () => {
	// Pixel 7 without its `defaultBrowserType`, which a describe group cannot set: the viewport,
	// the touch screen and the mobile user agent are what matter here.
	const {defaultBrowserType: _, ...pixel7} = devices['Pixel 7'];
	test.use(pixel7);

	test('the editor takes a tap and typing, and Deploy runs what was typed', async ({page}) => {
		await page.goto(PLAIN_URL);
		await ready(page);
		const box = await page.locator('[data-testid="editor"] .cm-editor').boundingBox();
		const viewport = page.viewportSize()!;
		expect(box!.height).toBeGreaterThan(200);
		expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);

		await editor(page).locator('.cm-line', {hasText: 'const {deployer} = namedAccounts;'}).tap();
		await page.keyboard.press('End');
		// Typed as text: on Android, CodeMirror takes a new line from the keyboard's input, which a
		// synthesized Enter keydown in Chromium's emulation does not produce.
		await page.keyboard.insertText("\nconsole.log('typed on a phone, on a line long enough to need wrapping on a narrow screen');");
		await expect(editor(page)).toContainText("console.log('typed on a phone");
		// long lines wrap: nothing scrolls sideways
		const scroller = page.locator('[data-testid="editor"] .cm-scroller');
		expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
		await page.getByTestId('deploy').tap();
		await expect(page.getByTestId('last-run')).toHaveText(/^1 transaction sent$/, {timeout: 60_000});
		await expect(page.locator(TRANSCRIPT)).toContainText('typed on a phone');
	});

	test('the Contracts view fits the screen, and a write goes through', async ({page}) => {
		await page.goto(PLAIN_URL);
		await ready(page);
		await page.getByTestId('deploy').tap();
		await expect(page.getByTestId('last-run')).toHaveText(/^1 transaction sent$/, {timeout: 60_000});
		await page.locator('[data-testid="contract-list"] [data-contract="Counter"]').tap();
		await page.getByTestId('tab-write').tap();
		await card(page, 'incBy').getByLabel('by').fill('3');
		await card(page, 'incBy').getByTestId('call').tap();
		await expect(card(page, 'incBy').getByTestId('call-transaction')).toHaveAttribute('data-status', 'success');
		const viewport = page.viewportSize()!;
		for (const testid of ['contracts', 'send-from', 'tx-hash']) {
			const box = (await page.getByTestId(testid).first().boundingBox())!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, testid).toBeLessThanOrEqual(viewport.width + 1);
		}
		await page.getByTestId('contracts').screenshot({path: test.info().outputPath('contracts-on-a-phone.png')});
	});

	test('the Transactions view fits the screen', async ({page}) => {
		await page.goto(PLAIN_URL);
		await ready(page);
		await page.getByTestId('deploy').tap();
		await expect(page.getByTestId('last-run')).toHaveText(/^1 transaction sent$/, {timeout: 60_000});
		await page.locator('[data-testid="contract-list"] [data-contract="Counter"]').tap();
		await page.getByTestId('tab-write').tap();
		await card(page, 'incBy').getByLabel('by').fill('3');
		await card(page, 'incBy').getByTestId('call').tap();
		await expect(card(page, 'incBy').getByTestId('call-transaction')).toHaveAttribute('data-status', 'success');
		await page.getByTestId('open-transactions').tap();
		await expect(rows(page)).toHaveCount(2, {timeout: 30_000});
		await expect(rows(page).first().getByTestId('tx-args')).toHaveText('(by: 3)');
		const viewport = page.viewportSize()!;
		for (const testid of ['transactions', 'transaction', 'tx-hash', 'tx-event']) {
			const box = (await page.getByTestId(testid).first().boundingBox())!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, testid).toBeLessThanOrEqual(viewport.width + 1);
		}
		expect(await page.getByTestId('transactions').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
		await page.getByTestId('transactions').screenshot({path: test.info().outputPath('transactions-on-a-phone.png')});
	});
});
