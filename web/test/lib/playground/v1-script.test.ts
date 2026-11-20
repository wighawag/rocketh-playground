/**
 * A hardhat-deploy v1 deploy script, run as the runner runs it: which failures say "this looks like
 * v1" and point to the migration guide. Each case runs the real pipeline, so the recognition is
 * tested on the error text the runner actually produces, not on a string written for the test.
 */
import {chain, run, project} from './helpers.js';
import {describe, it, expect, beforeEach} from 'vitest';
import {createVFSDeploymentStore} from '@rocketh/web';
import {MIGRATION_GUIDE_URL, looksLikeV1Script} from '../../../src/lib/playground/migration.js';

const SCRIPT = 'deploy/01_deploy_counter.ts';

/** hardhat-deploy v1's `DeployFunction`, as its documentation and its migration pairs write it. */
const V1_DEPLOY_FUNCTION = `import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;
	const {deployer} = await getNamedAccounts();

	await deploy('Counter', {from: deployer, log: true});
};
export default func;
func.tags = ['Counter'];
`;

describe('a v1-style deploy script', () => {
	let node: Awaited<ReturnType<typeof chain>>;
	let deploymentStore: ReturnType<typeof createVFSDeploymentStore>;
	beforeEach(async () => {
		node = await chain();
		deploymentStore = createVFSDeploymentStore();
	});
	const failing = async (script: string) => {
		const {outcome} = await run(project({[SCRIPT]: script}), {provider: node as never, deploymentStore});
		expect(outcome.ok).toBe(false);
		return outcome.error!;
	};

	it("is recognised when it reads getNamedAccounts from rocketh's environment (its types imports are erased)", async () => {
		const error = await failing(V1_DEPLOY_FUNCTION);
		expect(error).toMatchObject({name: 'TypeError', message: 'getNamedAccounts is not a function'});
		expect(looksLikeV1Script(error)).toBe(true);
	});

	it('is recognised when it calls hre.deployments.deploy', async () => {
		const error = await failing("export default async (hre: any) => {\n\tawait hre.deployments.deploy('Counter', {});\n};\n");
		expect(error).toMatchObject({name: 'TypeError', message: 'hre.deployments.deploy is not a function'});
		expect(looksLikeV1Script(error)).toBe(true);
	});

	it('is recognised when it calls hre.getNamedAccounts', async () => {
		const error = await failing('export default async (hre: any) => {\n\tawait hre.getNamedAccounts();\n};\n');
		expect(error).toMatchObject({name: 'TypeError', message: 'hre.getNamedAccounts is not a function'});
		expect(looksLikeV1Script(error)).toBe(true);
	});

	it('is recognised when the runner refuses an import of hardhat', async () => {
		const error = await failing("import {ethers} from 'hardhat';\n\nexport default async () => {\n\tconsole.log(ethers);\n};\n");
		expect(error.name).toBe('UnsupportedImportError');
		expect(error.message).toContain(`${SCRIPT} imports "hardhat",`);
		expect(looksLikeV1Script(error)).toBe(true);
	});

	it('is recognised when the runner refuses a value import of hardhat-deploy/types or hardhat-deploy', async () => {
		for (const specifier of ['hardhat-deploy/types', 'hardhat/types', 'hardhat-deploy']) {
			const error = await failing(`const types = require('${specifier}');\n\nexport default async () => {\n\tconsole.log(types);\n};\n`);
			expect(error.name).toBe('UnsupportedImportError');
			expect(error.message).toContain(`imports "${specifier}",`);
			expect(looksLikeV1Script(error)).toBe(true);
		}
	});
});

describe('an ordinary script error', () => {
	let node: Awaited<ReturnType<typeof chain>>;
	beforeEach(async () => {
		node = await chain();
	});
	const failing = async (files: Record<string, string>) => {
		const {outcome} = await run(project(files), {provider: node as never, deploymentStore: createVFSDeploymentStore()});
		expect(outcome.ok).toBe(false);
		return outcome.error!;
	};
	const v2 = (body: string) => `import {deployScript} from '../rocketh/deploy.js';\n\nexport default deployScript(async (env) => {\n\t${body}\n}, {});\n`;

	it('is not recognised: a throw, a TypeError of its own, a ReferenceError, an unsupported import', async () => {
		const errors = [
			await failing({'deploy/02_throws.ts': v2("throw new Error('failed on purpose');")}),
			await failing({'deploy/02_type.ts': v2('const f: any = undefined;\n\tf.deploy();')}),
			await failing({'deploy/02_page.ts': v2("document.title = 'x';")}),
			await failing({'deploy/02_lodash.ts': "import _ from 'lodash';\n\nexport default async () => console.log(_);\n"}),
			await failing({'deploy/02_missing.ts': "import {x} from './hardhat.js';\nexport default x;\n"}),
		];
		expect(errors.map((e) => e.name)).toEqual(['Error', 'TypeError', 'ReferenceError', 'UnsupportedImportError', 'MissingFileError']);
		for (const error of errors) expect(looksLikeV1Script(error), error.message).toBe(false);
	});

	it('is not recognised when only the name of an unsupported package starts like hardhat', () => {
		expect(
			looksLikeV1Script({name: 'UnsupportedImportError', message: 'deploy/02.ts imports "hardhat-gas-reporter", which the playground cannot provide.'}),
		).toBe(false);
	});
});

describe('the migration guide', () => {
	it("is rocketh.dev's page for hardhat-deploy v1 users", () => {
		expect(MIGRATION_GUIDE_URL).toBe('https://rocketh.dev/hardhat-deploy/migration/');
	});
});
