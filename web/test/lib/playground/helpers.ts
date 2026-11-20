/**
 * The playground's pipeline in node: the same soljson the build ships, the same TypeScript, a
 * webevm node in-process. Import THIS (or `log-hook`) before anything that imports rocketh, so
 * rocketh's named-logs factory is installed first, as in the runner worker.
 */
import '../../../src/lib/playground/runner/log-hook.js';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createNode} from 'webevm';
import {createLogStream} from '@rocketh/playground/log';
import {ensureSoljson} from '../../../scripts/soljson.mjs';
import {compileProject, solidityCompileOf, type Soljson, type SolidityCompile} from '../../../src/lib/playground/compiler/solidity.js';
import {transpileProject} from '../../../src/lib/playground/typescript/transpile.js';
import {startingProject, type ProjectFiles} from '../../../src/lib/playground/project/template.js';
import {runDeployScripts, type RunDependencies} from '../../../src/lib/playground/runner/run.js';
import {CHAIN_ID, STATE_HISTORY_BLOCKS} from '../../../src/lib/playground/runner/compose-config.js';
import {INITIAL_BALANCE, TEST_ADDRESSES} from '../../../src/lib/playground/runner/test-keys.js';

/** soljson is an emscripten script for `importScripts`, with no `module.exports`: evaluate it. */
async function loadSoljson(path: string): Promise<Soljson> {
	const source = readFileSync(path, 'utf8');
	return new Promise((resolve) => {
		const preset: Record<string, unknown> = {};
		preset.onRuntimeInitialized = () => resolve(preset as unknown as Soljson);
		new Function('Module', 'require', '__filename', '__dirname', source)(preset, createRequire(path), path, '.');
		if (preset.calledRun) resolve(preset as unknown as Soljson);
	});
}

let soljson: Promise<Soljson> | undefined;
/** The shipped soljson, loaded in node once per test file. */
export function nodeSoljson(): Promise<Soljson> {
	soljson ??= ensureSoljson({log: () => {}}).then(loadSoljson);
	return soljson;
}

let compiler: Promise<SolidityCompile> | undefined;
export function solidityCompile(): Promise<SolidityCompile> {
	compiler ??= nodeSoljson().then(solidityCompileOf);
	return compiler;
}

/** What the page does before a run: compile, add the artifacts, transpile. */
export async function prepare(files: ProjectFiles) {
	const compiled = compileProject(await solidityCompile(), files);
	const transpiled = transpileProject(ts, {...files, ...compiled.artifacts});
	return {compiled, transpiled};
}

/** A node as the page creates it (`session.ts`); `stateHistory` can be narrowed for a test. */
export function chain(options: {stateHistory?: {blocks: number}} = {}) {
	return createNode({
		chainId: CHAIN_ID,
		stateHistory: options.stateHistory ?? {blocks: STATE_HISTORY_BLOCKS},
		initialBalances: Object.fromEntries(TEST_ADDRESSES.map((a) => [a, INITIAL_BALANCE])),
	});
}

/** Compile, transpile and run `files` against `deps`; the transcript is returned as lines. */
export async function run(files: ProjectFiles, deps: Omit<RunDependencies, 'logs'>) {
	const {compiled, transpiled} = await prepare(files);
	if (!compiled.ok) throw new Error(`compile failed: ${JSON.stringify(compiled.diagnostics)}`);
	if (!transpiled.ok) throw new Error(`transpile failed: ${JSON.stringify(transpiled.diagnostics)}`);
	const logs = createLogStream();
	const outcome = await runDeployScripts({modules: transpiled.modules, imports: transpiled.imports}, {...deps, logs});
	return {outcome, transcript: logs.entries().map((e) => `[${e.source}] ${e.text}`)};
}

export function project(overrides: ProjectFiles = {}): ProjectFiles {
	return {...startingProject(), ...overrides};
}

export const sent = (requests: Record<string, number>) => requests.eth_sendRawTransaction ?? 0;
