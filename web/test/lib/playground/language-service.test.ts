/**
 * The editor's language service in node, as the TypeScript worker holds it: the declarations the
 * build collects, the artifact types of a real compile, the project's files.
 *
 * What it exists for (the spec's acceptance criterion): a wrong constructor argument is flagged
 * before Deploy, and the run still goes ahead, because a run is transpiled, not type-checked.
 */
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import ts from 'typescript';
import {createVFSDeploymentStore} from '@rocketh/web';
import {collectDeclarations} from '../../../scripts/declarations.mjs';
import {BARE_MODULE_NAMES, TYPE_ONLY_MODULES} from '../../../src/lib/playground/runner/bare-modules.js';
import {projectCompilerOptions, type Declarations} from '../../../src/lib/playground/typescript/project-options.js';
import {createLanguageService} from '../../../src/lib/playground/typescript/language-service.js';
import {compileProject} from '../../../src/lib/playground/compiler/solidity.js';
import type {ProjectFiles} from '../../../src/lib/playground/project/template.js';
import {chain, project, run, sent, solidityCompile} from './helpers.js';

const DEPLOY = 'deploy/01_deploy_counter.ts';

/** Counter, given a constructor argument (the template's Counter has none). */
function counterTakingAStart(files: ProjectFiles): ProjectFiles {
	return {
		...files,
		'contracts/Counter.sol': files['contracts/Counter.sol'].replace('uint public x;', 'uint public x;\n\n  constructor(uint start) {\n    x = start;\n  }'),
	};
}

/** The template's deploy call, with `extra` added after `artifact`. */
const deployWith = (files: ProjectFiles, extra: string) => files[DEPLOY].replace('artifact: artifacts.Counter,', `artifact: artifacts.Counter,\n\t\t\t${extra}`);

let declarations: Declarations;
beforeAll(() => {
	declarations = collectDeclarations({specifiers: [...BARE_MODULE_NAMES, ...TYPE_ONLY_MODULES], compilerOptions: projectCompilerOptions(ts)});
});

async function serviceFor(files: ProjectFiles) {
	const compiled = compileProject(await solidityCompile(), files);
	expect(compiled.ok).toBe(true);
	return createLanguageService(ts, declarations, {...files, ...compiled.types});
}

const errors = (service: Awaited<ReturnType<typeof serviceFor>>, path: string) =>
	service.diagnostics(path).filter((d) => d.severity === 'error');

describe('the declarations', () => {
	it('hold every package a project may import, and the lib that declares console', () => {
		for (const name of ['rocketh', '@rocketh/deploy', '@rocketh/unknown-signer', 'viem', 'abitype', 'eip-1193']) {
			expect(declarations.files[`/node_modules/${name}/package.json`], name).toBeDefined();
		}
		expect(declarations.libs['/lib.webworker.d.ts']).toContain('declare var console: Console;');
		// viem and rocketh resolve different abitype versions: each gets its own
		expect(Object.keys(declarations.files).some((p) => p.startsWith('/node_modules/viem/node_modules/abitype/'))).toBe(true);
	});
});

describe('the language service', () => {
	it('finds nothing wrong with the starting project, console included', async () => {
		const files = project();
		const service = await serviceFor(files);
		for (const path of Object.keys(files)) expect(service.diagnostics(path), path).toEqual([]);
		service.setFile(DEPLOY, files[DEPLOY].replace('const {deployer} = namedAccounts;', "const {deployer} = namedAccounts;\n\t\tconsole.log('deploying');"));
		expect(service.diagnostics(DEPLOY)).toEqual([]);
	});

	it('flags a constructor argument of the wrong type, at its line', async () => {
		const files = counterTakingAStart(project());
		const service = await serviceFor(files);
		// with a constructor argument, leaving `args` out is itself an error
		expect(errors(service, DEPLOY).map((d) => d.message).join('\n')).toContain("Property 'args' is missing");
		service.setFile(DEPLOY, deployWith(files, 'args: [1],'));
		expect(errors(service, DEPLOY)).toMatchObject([{line: 10, message: "Type 'number' is not assignable to type 'bigint'."}]);
		service.setFile(DEPLOY, deployWith(files, 'args: [1n],'));
		expect(service.diagnostics(DEPLOY)).toEqual([]);
	});

	it('flags a misspelled deploy option', async () => {
		const files = project();
		const service = await serviceFor(files);
		service.setFile(DEPLOY, deployWith(files, 'confirmatons: 1,'));
		expect(errors(service, DEPLOY)).toMatchObject([
			{line: 10, message: expect.stringContaining("Object literal may only specify known properties, and 'confirmatons' does not exist")},
		]);
	});

	it("does not flag args for a contract without a constructor: viem types them as readonly unknown[]", async () => {
		const files = project();
		const service = await serviceFor(files);
		service.setFile(DEPLOY, deployWith(files, 'args: [1n],'));
		expect(service.diagnostics(DEPLOY)).toEqual([]);
	});

	it("takes a compile's artifact types in place of the last, dropping a contract that is gone", async () => {
		const files = project();
		const service = await serviceFor(files);
		const renamed = compileProject(await solidityCompile(), {
			...files,
			'contracts/Counter.sol': files['contracts/Counter.sol'].replace('contract Counter', 'contract Tally'),
		});
		service.setArtifactTypes(renamed.types);
		expect(errors(service, DEPLOY).map((d) => d.message)).toEqual([expect.stringContaining("Property 'Counter' does not exist")]);
		service.setFile(DEPLOY, files[DEPLOY].replace('artifacts.Counter', 'artifacts.Tally'));
		expect(service.diagnostics(DEPLOY)).toEqual([]);
	});

	it('answers the editor: lints by character offset, completion, hover', async () => {
		const files = project();
		const service = await serviceFor(files);
		const text = deployWith(files, 'confirmatons: 1,');
		service.updateFile({path: `/${DEPLOY}`, code: text});
		const [lint] = service.getLints({path: `/${DEPLOY}`, diagnosticCodesToIgnore: []});
		expect(text.slice(lint.from, lint.to)).toBe('confirmatons');
		const dot = text.indexOf('artifacts.Counter') + 'artifacts.'.length;
		const completion = await service.getAutocompletion({path: `/${DEPLOY}`, context: {pos: dot, explicit: true}});
		expect(completion?.options.map((o) => o.label)).toContain('Counter');
		const hover = service.getHover({path: `/${DEPLOY}`, pos: text.indexOf('deployScript(') + 1});
		expect(ts.displayPartsToString(hover?.quickInfo?.displayParts)).toContain('deployScript');
	});
});

describe('a type error never blocks a run', () => {
	let node: Awaited<ReturnType<typeof chain>>;
	beforeEach(async () => {
		node = await chain();
	});
	const deps = () => ({provider: node as never, deploymentStore: createVFSDeploymentStore()});

	it('runs a script the editor flags, and it deploys: viem encodes the number 1 as a uint256', async () => {
		const files = counterTakingAStart(project());
		const edited = {...files, [DEPLOY]: deployWith(files, 'args: [1],')};
		const service = await serviceFor(edited);
		expect(errors(service, DEPLOY)).toHaveLength(1);
		const {outcome} = await run(edited, deps());
		expect(outcome.error).toBeUndefined();
		expect(outcome.ok).toBe(true);
		expect(sent(outcome.requests)).toBe(1);
	});
});
