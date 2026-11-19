import {test, expect, type Page} from '@playwright/test';
import {PLAIN_URL} from '../ports';

/**
 * The playground in a real browser, against the production build: what only a browser can show.
 * The four workers start (one of them classic, for soljson's `importScripts`), Deploy writes the
 * records, a reload restores them with the chain, and Stop ends a script that never yields.
 *
 * Each test gets a fresh browser context, so empty IndexedDB; a reload inside a test keeps it.
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

async function editFile(page: Page, path: string, text: string) {
	await page.locator(`[data-testid="project-files"] [data-path="${path}"]`).click();
	await page.getByTestId('editor').fill(text);
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

	const original = await page.locator('[data-testid="project-files"] [data-path="deploy/01_deploy_counter.ts"]').click().then(() =>
		page.getByTestId('editor').inputValue(),
	);
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
	const original = await page.getByTestId('editor').inputValue();
	await editFile(page, 'deploy/01_deploy_counter.ts', original.replace('async ({deploy, namedAccounts}) => {', "async ({deploy, namedAccounts}) => {\n\t\tdocument.title = 'from a script';"));
	await deploy(page, /^The run failed$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('document is not defined');
	await expect(page.getByTestId('block')).toHaveText('chain at block 0');
	expect(await page.title()).not.toBe('from a script');
});

test('a Solidity error is shown with its file and line, and nothing is sent', async ({page}) => {
	await page.goto(PLAIN_URL);
	await ready(page);
	await page.locator('[data-testid="project-files"] [data-path="contracts/Counter.sol"]').click();
	const source = await page.getByTestId('editor').inputValue();
	await page.getByTestId('editor').fill(source.replace('x++;', 'x++'));
	await deploy(page, /^Nothing was sent$/);
	await expect(page.locator(TRANSCRIPT)).toContainText('contracts/Counter.sol:11:');
});
