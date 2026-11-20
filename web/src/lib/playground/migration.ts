/**
 * Helping a hardhat-deploy v1 user: which failed runs look like a v1 deploy script, and where the
 * migration guide is.
 *
 * A run's error crosses from the runner as plain data (`RunError`: a name and a message), so the
 * recognition reads those, as the runner produces them (`test/lib/playground/v1-script.test.ts`
 * runs each shape through the real pipeline). Two shapes:
 *
 * - the runner refusing an import of a module only a v1 project has: `hardhat` and
 *   `hardhat-deploy` (with their subpaths, `hardhat/types`, `hardhat-deploy/types`) and
 *   `hardhat-deploy-ethers`. A type-only import (`import {DeployFunction} from
 *   'hardhat-deploy/types'`) is erased by the transpiler and never reaches the runner, so a script
 *   that only imports types fails on the next shape instead;
 * - a TypeError reading v1's `hre` API off rocketh's environment: `getNamedAccounts`,
 *   `getUnnamedAccounts`, `getChainId` or `deployments` named in the message
 *   (`getNamedAccounts is not a function`, `hre.deployments.deploy is not a function`).
 */
import type {RunError} from './runner/run.js';

/** rocketh.dev's page for hardhat-deploy v1 users: what changed, and how to port a project. */
export const MIGRATION_GUIDE_URL = 'https://rocketh.dev/hardhat-deploy/migration/';

/** What the transcript adds after rocketh's own error, when the run looks like a v1 script. */
export const V1_SCRIPT_HINT =
	"This looks like a hardhat-deploy v1 deploy script: rocketh's deploy scripts are made with deployScript(...) and receive their functions (deploy, namedAccounts, ...) from the environment rather than from hre. What changed, and how to port it:";

export const MIGRATION_GUIDE_LABEL = 'Coming from hardhat-deploy v1 (rocketh.dev)';

const V1_ONLY_MODULE = /^(hardhat|hardhat-deploy)(\/.*)?$|^hardhat-deploy-ethers$/;

/** The specifier an `UnsupportedImportError` names (`registry.ts`: `<file> imports "<specifier>", ...`). */
const REFUSED_IMPORT = / imports "([^"]+)", which the playground cannot provide/;

const V1_HRE_API = /\b(getNamedAccounts|getUnnamedAccounts|getChainId|deployments)\b/;

export function looksLikeV1Script(error: Pick<RunError, 'name' | 'message'>): boolean {
	if (error.name === 'UnsupportedImportError') {
		const specifier = REFUSED_IMPORT.exec(error.message)?.[1];
		return specifier !== undefined && V1_ONLY_MODULE.test(specifier);
	}
	if (error.name === 'TypeError') return V1_HRE_API.test(error.message);
	return false;
}
