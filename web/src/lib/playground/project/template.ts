/**
 * The project `hardhat-deploy init` creates, as the playground starts it.
 *
 * `web/project-template/` is the published hardhat-deploy tarball's `templates/basic/`, copied
 * verbatim by `scripts/update-project-template.mjs` (version and integrity in
 * `project-template.json`). Nothing here edits it: the playground's starting files ARE the
 * template's files, which is what makes "what works here works after `init`" true.
 */
import record from '../../../../project-template.json';

/** A project as the playground holds it: a path relative to the project root, and its text. */
export type ProjectFiles = Record<string, string>;

const raw = import.meta.glob('../../../../project-template/**/*', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const PREFIX = '../../../../project-template/';

/** Every file of the template, as published. The export starts from these. */
export const TEMPLATE_FILES: ProjectFiles = Object.fromEntries(
	Object.entries(raw).map(([path, text]) => [path.slice(PREFIX.length), text]),
);

/** Which hardhat-deploy release the template came from. */
export const TEMPLATE_SOURCE: {
	package: string;
	version: string;
	integrity: string;
} = record;

/**
 * The files a reader edits: the contract, the deploy script, and rocketh's config and setup.
 * `contracts/Counter.t.sol` is a Foundry test that imports `forge-std`, which the playground
 * cannot compile (no Solidity imports in v1), so it stays in the template for the export only.
 */
export const STARTING_PROJECT_PATHS = [
	'contracts/Counter.sol',
	'deploy/01_deploy_counter.ts',
	'rocketh/config.ts',
	'rocketh/deploy.ts',
] as const;

/**
 * The starting project's Counter sample: its contract and its deploy script. A `2.` link with
 * `"base": "bare"` opens without them (`bareProject()`), and Download leaves out the template's
 * Counter tests when a project lacks either (`export-project.ts`).
 *
 * rocketh keeps a copy of this list in `scripts/test-playground-examples.sh` (its deploy check
 * removes these files, and the Counter tests, before writing an example over the template), so
 * that an example deploys there on the base it opens on here: a change to one is made in both.
 */
export const COUNTER_SAMPLE_PATHS = [
	'contracts/Counter.sol',
	'deploy/01_deploy_counter.ts',
] as const;

/** The template's files at `paths`; throws when one is missing, so a template change is noticed. */
function templateFiles(paths: readonly string[]): ProjectFiles {
	const files: ProjectFiles = {};
	for (const path of paths) {
		const text = TEMPLATE_FILES[path];
		if (text === undefined)
			throw new Error(`the project template has no ${path}`);
		files[path] = text;
	}
	return files;
}

export function startingProject(): ProjectFiles {
	return templateFiles(STARTING_PROJECT_PATHS);
}

/**
 * The bare base a `2.` link with `"base": "bare"` opens over: the starting project without its
 * Counter sample (`COUNTER_SAMPLE_PATHS`), so `rocketh/config.ts` and `rocketh/deploy.ts`. It
 * throws when a Counter sample file is missing from the template, as `startingProject()` throws
 * for a starting file, so a template update that renamed or removed one fails the tests rather
 * than leaving `Counter` in every opened example.
 */
export function bareProject(): ProjectFiles {
	templateFiles(COUNTER_SAMPLE_PATHS);
	const sample: readonly string[] = COUNTER_SAMPLE_PATHS;
	return templateFiles(
		STARTING_PROJECT_PATHS.filter((path) => !sample.includes(path)),
	);
}
