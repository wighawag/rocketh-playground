/**
 * Installs and deploys an exported project the way its README tells a reader to:
 * `pnpm i && pnpm hardhat compile && pnpm hardhat deploy`, in a temporary folder.
 *
 * Nothing it runs writes to a shared location: the pnpm store, every XDG folder (so pnpm's
 * metadata cache, hardhat's compiler cache and hardhat's config) point inside the temporary
 * folder, and the environment pnpm gives the test run (`npm_*`, `PNPM_*`, the `.bin` folders on
 * `PATH`) is not passed on, so the project installs as it would from a reader's shell.
 *
 * Used by `installs-and-deploys.export.ts`, which `pnpm test:export` runs.
 */
import {spawn} from 'node:child_process';
import {
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
	lstatSync,
} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, relative, sep} from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

/** The commands, in order, as the exported README names them. */
export const STEPS: readonly (readonly [string, ...string[]])[] = [
	['pnpm', 'i'],
	['pnpm', 'hardhat', 'compile'],
	['pnpm', 'hardhat', 'deploy'],
];

/** How much of a failed step's output its error keeps. */
const OUTPUT_TAIL = 8_000;

/** Writes the zip's files under `dir`; returns the folder it unzips to (its one top folder). */
export function unpackZip(zip: Uint8Array, dir: string): string {
	const tops = new Set<string>();
	for (const [path, bytes] of Object.entries(unzipSync(zip))) {
		if (path.endsWith('/')) continue;
		if (path.split('/').some((part) => part === '..' || part === ''))
			throw new Error(`the zip holds an unsafe path: ${path}`);
		tops.add(path.split('/')[0]);
		const target = join(dir, ...path.split('/'));
		mkdirSync(dirname(target), {recursive: true});
		writeFileSync(target, strFromU8(bytes));
	}
	if (tops.size !== 1)
		throw new Error(
			`the zip should unzip to one folder, not ${[...tops].join(', ')}`,
		);
	return join(dir, [...tops][0]);
}

/** The XDG folders an isolated run gets, by variable. */
const XDG = [
	'XDG_CACHE_HOME',
	'XDG_CONFIG_HOME',
	'XDG_DATA_HOME',
	'XDG_STATE_HOME',
] as const;

/** Where each XDG folder is for this user, outside the test. */
export function realXdg(env: NodeJS.ProcessEnv = process.env) {
	const home = homedir();
	return {
		XDG_CACHE_HOME: env.XDG_CACHE_HOME || join(home, '.cache'),
		XDG_CONFIG_HOME: env.XDG_CONFIG_HOME || join(home, '.config'),
		XDG_DATA_HOME: env.XDG_DATA_HOME || join(home, '.local', 'share'),
		XDG_STATE_HOME: env.XDG_STATE_HOME || join(home, '.local', 'state'),
	};
}

/** The environment a reader's shell would have, without what pnpm and vitest add to a test run. */
export function readerEnv(
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(env)) {
		if (/^npm_/i.test(name) || /^PNPM_/.test(name) || /^VITEST/.test(name))
			continue;
		if (name === 'INIT_CWD' || name === 'NODE_ENV' || name === 'TEST') continue;
		out[name] = value;
	}
	if (out.PATH)
		out.PATH = out.PATH.split(':')
			.filter((entry) => !entry.split(sep).includes('node_modules'))
			.join(':');
	return out;
}

/** A reader's environment with the pnpm store and every XDG folder inside `root`. */
export function isolatedEnv(
	root: string,
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const out = readerEnv(env);
	// pnpm 11 reads `pnpm_config_*`, pnpm 10 `npm_config_*`: whichever pnpm the reader has
	out.pnpm_config_store_dir = join(root, 'pnpm-store');
	out.npm_config_store_dir = join(root, 'pnpm-store');
	for (const name of XDG) out[name] = join(root, name.toLowerCase());
	return out;
}

/** Runs one command; rejects naming it, with the end of its output, if it does not exit 0. */
export function runStep(
	command: readonly [string, ...string[]],
	options: {cwd: string; env: NodeJS.ProcessEnv},
): Promise<string> {
	const name = command.join(' ');
	return new Promise((resolve, reject) => {
		const child = spawn(command[0], command.slice(1), {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		const keep = (chunk: Buffer) => {
			output = (output + chunk.toString()).slice(-OUTPUT_TAIL * 4);
		};
		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		child.on('error', (error) =>
			reject(new Error(`"${name}" could not start: ${error.message}`)),
		);
		child.on('close', (code, signal) => {
			if (code === 0) resolve(output);
			else
				reject(
					new Error(
						`"${name}" failed (${signal ? `signal ${signal}` : `exit ${code}`}) in ${options.cwd}:\n${output.slice(-OUTPUT_TAIL)}`,
					),
				);
		});
	});
}

/** Runs the README's commands in `project`, in order, stopping at the first that fails. */
export async function installAndDeploy(
	project: string,
	env: NodeJS.ProcessEnv,
): Promise<Record<string, string>> {
	const outputs: Record<string, string> = {};
	for (const step of STEPS)
		outputs[step.join(' ')] = await runStep(step, {cwd: project, env});
	return outputs;
}

/** Every file below `root` (symbolic links not followed), relative to it. */
export function filesBelow(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		let entries;
		try {
			entries = readdirSync(dir, {withFileTypes: true});
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else out.push(relative(root, path));
		}
	};
	walk(root);
	return out;
}

/**
 * The files the run wrote below `isolated` that were also written below `real` since `since`
 * (a time in ms): the run's writes that reached the shared location. Empty when it is untouched.
 *
 * Only the paths the run itself wrote are looked at, so what other programs keep in the shared
 * folder does not count, unless they wrote the same file during the run.
 */
export function writesReaching(
	isolated: string,
	real: string,
	since: number,
): string[] {
	const reached: string[] = [];
	for (const path of filesBelow(isolated)) {
		let stat;
		try {
			stat = lstatSync(join(real, path));
		} catch {
			continue;
		}
		// mtime, not ctime: another project's install hard-linking a store file changes its ctime
		if (stat.mtimeMs >= since) reached.push(path);
	}
	return reached;
}

/** Whether `path` exists. */
export function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}
