/**
 * Solidity in, `generated/artifacts/` out: everything about a compile except running solc, which
 * the compiler worker does (it is the only thing that needs a classic worker).
 *
 * Pure: no worker, no DOM, so it runs the same in node, where the tests drive it with the same
 * soljson the build ships.
 */
import {lineAndColumn, type Diagnostic} from '../diagnostic.js';
import type {ProjectFiles} from '../project/template.js';

/** soljson's entry point, as `Module.cwrap('solidity_compile', ...)` returns it with no import callback. */
export type SolidityCompile = (standardJSONInput: string) => string;

/** The subset of soljson's emscripten `Module` the playground uses. */
export type Soljson = {cwrap: (name: string, ret: string, args: string[]) => (...args: unknown[]) => unknown};

export function solidityCompileOf(soljson: Soljson): SolidityCompile {
	const compile = soljson.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
	// A null import callback: v1 compiles `contracts/` alone, and an import fails in solc with
	// "File import callback not supported", located at the import.
	return (input) => compile(input, 0, 0) as string;
}

export type SolcOutput = {
	errors?: {
		severity: 'error' | 'warning' | 'info';
		message: string;
		formattedMessage?: string;
		sourceLocation?: {file: string; start: number; end: number};
	}[];
	contracts?: Record<string, Record<string, SolcContract>>;
};

type SolcContract = {
	abi: unknown[];
	metadata: string;
	devdoc?: unknown;
	userdoc?: unknown;
	evm: {
		bytecode: {object: string; linkReferences?: unknown};
		deployedBytecode: {object: string; linkReferences?: unknown; immutableReferences?: unknown};
		methodIdentifiers?: unknown;
	};
};

/** The project's Solidity sources: `contracts/**.sol`, minus Foundry tests (`*.t.sol`). */
export function soliditySources(files: ProjectFiles): ProjectFiles {
	return Object.fromEntries(
		Object.entries(files).filter(([path]) => path.startsWith('contracts/') && path.endsWith('.sol') && !path.endsWith('.t.sol')),
	);
}

/** The template's `default` profile (`hardhat.config.ts`): optimizer off. */
export function standardJSONInput(sources: ProjectFiles) {
	return {
		language: 'Solidity',
		sources: Object.fromEntries(Object.entries(sources).map(([path, content]) => [path, {content}])),
		settings: {
			optimizer: {enabled: false, runs: 200},
			outputSelection: {
				'*': {
					'*': ['abi', 'metadata', 'devdoc', 'userdoc', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers'],
				},
			},
		},
	};
}

/** solc's errors and warnings, located in the file they are about. */
export function solcDiagnostics(output: SolcOutput, sources: ProjectFiles): Diagnostic[] {
	return (output.errors ?? [])
		.filter((e) => e.severity === 'error' || e.severity === 'warning')
		.map((e) => {
			const location = e.sourceLocation;
			const file = location?.file ?? '';
			const at = location && sources[file] !== undefined ? lineAndColumn(sources[file], location.start) : {line: 1, column: 1};
			return {file, ...at, message: e.message, severity: e.severity as 'error' | 'warning', source: 'solc' as const};
		});
}

/**
 * The `generated/artifacts/` modules the template imports
 * (`rocketh/deploy.ts`: `import * as artifacts from '../generated/artifacts/index.js'`), and the
 * declarations beside them that type them.
 *
 * The layout is hardhat-deploy's "javascript" destination (`dist/generate-types.js` in the
 * published hardhat-deploy): one `<Name>.js` per deployable contract exporting `Artifact_<Name>`,
 * with a `<Name>.d.ts` declaring it as the artifact's literal type, and an `index.js` re-exporting
 * each as `<Name>`, with an `index.d.ts` of the same text. The artifact object is what that
 * generator writes: hardhat's artifact fields merged with solc's output for the contract.
 *
 * The `.js` files are what a run evaluates; the `.d.ts` files are what the editor's language
 * service reads, which is what makes `artifacts.Counter` typed and a wrong constructor argument an
 * error before Deploy.
 */
export function generateArtifactModules(output: SolcOutput): {modules: ProjectFiles; types: ProjectFiles} {
	const modules: ProjectFiles = {};
	const types: ProjectFiles = {};
	let index = '';
	for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
		for (const [contractName, c] of Object.entries(contracts)) {
			if (!c.evm.bytecode.object) continue; // an interface or an abstract contract
			const artifact = {
				contractName,
				sourceName,
				abi: c.abi,
				bytecode: `0x${c.evm.bytecode.object}`,
				deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
				linkReferences: c.evm.bytecode.linkReferences ?? {},
				deployedLinkReferences: c.evm.deployedBytecode.linkReferences ?? {},
				immutableReferences: c.evm.deployedBytecode.immutableReferences ?? {},
				inputSourceName: sourceName,
				metadata: c.metadata,
				devdoc: c.devdoc,
				userdoc: c.userdoc,
				evm: {methodIdentifiers: c.evm.methodIdentifiers},
			};
			const json = JSON.stringify(artifact, null, 2);
			modules[`generated/artifacts/${contractName}.js`] = `export const Artifact_${contractName} = /** @type {const} **/ (${json});\n`;
			types[`generated/artifacts/${contractName}.d.ts`] = `export declare const Artifact_${contractName}: ${json};\n`;
			index += `export {Artifact_${contractName} as ${contractName}} from './${contractName}.js';\n`;
		}
	}
	modules['generated/artifacts/index.js'] = index;
	types['generated/artifacts/index.d.ts'] = index;
	return {modules, types};
}

export type CompileResult = {
	/** `generated/artifacts/*.js`, what a run evaluates; empty when there are errors. */
	artifacts: ProjectFiles;
	/** `generated/artifacts/*.d.ts`, what the editor's language service types them with; empty when there are errors. */
	types: ProjectFiles;
	diagnostics: Diagnostic[];
	ok: boolean;
};

/** Compile the project's Solidity and generate its artifact modules. */
export function compileProject(compile: SolidityCompile, files: ProjectFiles): CompileResult {
	const sources = soliditySources(files);
	const output = JSON.parse(compile(JSON.stringify(standardJSONInput(sources)))) as SolcOutput;
	const diagnostics = solcDiagnostics(output, sources);
	const ok = !diagnostics.some((d) => d.severity === 'error');
	const generated = ok ? generateArtifactModules(output) : {modules: {}, types: {}};
	return {artifacts: generated.modules, types: generated.types, diagnostics, ok};
}
