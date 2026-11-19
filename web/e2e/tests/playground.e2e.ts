import {test, expect, devices, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {PLAIN_URL} from '../ports';

/**
 * The playground in a real browser, against the production build: what only a browser can show.
 * The four workers start (one of them classic, for soljson's `importScripts`), Deploy writes the
 * records, a reload restores them with the chain, and Stop ends a script that never yields.
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
});
