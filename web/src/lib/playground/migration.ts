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
 *   (`getNamedAccounts is not a function`, `hre.deployments.deploy is not a function`);
 * - the runner's own error that a script `has no default export made with deployScript(...)`, as a
 *   v1 `module.exports = async (hre) => {...}` script fails before rocketh runs it. That error is
 *   also what a v2 script that forgot `deployScript` gets, so it counts only when the script's text
 *   (from the project files the session ran, keyed by the path the message starts with) is shaped
 *   like v1: it names `hre`, `HardhatRuntimeEnvironment` or v1's `hre` API.
 */
import type {RunError} from './runner/run.js';

/** rocketh.dev's page for hardhat-deploy v1 users: what changed, and how to port a project. */
export const MIGRATION_GUIDE_URL =
	'https://rocketh.dev/hardhat-deploy/migration/';

/** What the transcript adds after rocketh's own error, when the run looks like a v1 script. */
export const V1_SCRIPT_HINT =
	"This looks like a hardhat-deploy v1 deploy script: rocketh's deploy scripts are made with deployScript(...) and receive their functions (deploy, namedAccounts, ...) from the environment rather than from hre. What changed, and how to port it:";

export const MIGRATION_GUIDE_LABEL =
	'Coming from hardhat-deploy v1 (rocketh.dev)';

const V1_ONLY_MODULE =
	/^(hardhat|hardhat-deploy)(\/.*)?$|^hardhat-deploy-ethers$/;

/** The specifier an `UnsupportedImportError` names (`registry.ts`: `<file> imports "<specifier>", ...`). */
const REFUSED_IMPORT =
	/ imports "([^"]+)", which the playground cannot provide/;

const V1_HRE_API =
	/\b(getNamedAccounts|getUnnamedAccounts|getChainId|deployments)\b/;

/** The runner's error for a script whose default export is not a function (`runner/run.ts`). */
const NO_DEFAULT_EXPORT =
	/^(.+) has no default export made with deployScript\(\.\.\.\)$/;

const V1_SHAPED_SCRIPT =
	/\bhre\b|\bHardhatRuntimeEnvironment\b|\b(getNamedAccounts|getUnnamedAccounts|getChainId|deployments)\b/;

/** `files` are the project's sources by path, as the session ran them; only the third shape reads them. */
export function looksLikeV1Script(
	error: Pick<RunError, 'name' | 'message'>,
	files: Readonly<Record<string, string>> = {},
): boolean {
	if (error.name === 'UnsupportedImportError') {
		const specifier = REFUSED_IMPORT.exec(error.message)?.[1];
		return specifier !== undefined && V1_ONLY_MODULE.test(specifier);
	}
	if (error.name === 'TypeError') return V1_HRE_API.test(error.message);
	if (error.name === 'Error') {
		const path = NO_DEFAULT_EXPORT.exec(error.message)?.[1];
		const script = path === undefined ? undefined : files[path];
		return script !== undefined && V1_SHAPED_SCRIPT.test(script);
	}
	return false;
}
