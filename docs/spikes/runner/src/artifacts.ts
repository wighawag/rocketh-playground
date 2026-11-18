/**
 * From solc's standard-JSON output to the `generated/artifacts/` modules the template imports
 * (`rocketh/deploy.ts`: `import * as artifacts from '../generated/artifacts/index.js'`).
 *
 * The layout is hardhat-deploy's "javascript" destination (`generate-types.js` in the published
 * hardhat-deploy): one `<Name>.js` per contract exporting `Artifact_<Name>`, and an `index.js`
 * re-exporting each as `<Name>`. The artifact object is what that generator writes: hardhat's
 * artifact fields merged with solc's output for the contract.
 */
export type SolcOutput = {
	errors?: {severity: string; formattedMessage: string; sourceLocation?: {file: string; start: number}}[];
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

export function standardJSONInput(sources: Record<string, string>) {
	return {
		language: 'Solidity',
		sources: Object.fromEntries(Object.entries(sources).map(([path, content]) => [path, {content}])),
		// The template's `default` profile (hardhat.config.ts): 0.8.28, optimizer off.
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

export function generateArtifactModules(output: SolcOutput): Record<string, string> {
	const files: Record<string, string> = {};
	let index = '';
	for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
		for (const [contractName, c] of Object.entries(contracts)) {
			if (!c.evm.bytecode.object) continue; // an interface or an abstract contract: nothing to deploy
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
			files[`generated/artifacts/${contractName}.js`] =
				`export const Artifact_${contractName} = /** @type {const} **/ (${JSON.stringify(artifact, null, 2)});\n`;
			index += `export {Artifact_${contractName} as ${contractName}} from './${contractName}.js';\n`;
		}
	}
	files['generated/artifacts/index.js'] = index;
	return files;
}
