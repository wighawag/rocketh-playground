/** Types for `declarations.mjs`, so the vite plugin and the tests can import it from TypeScript. */
import type {CompilerOptions} from 'typescript';
export declare function collectDeclarations(options: {
	specifiers: readonly string[];
	compilerOptions: CompilerOptions;
}): {
	files: Record<string, string>;
	libs: Record<string, string>;
	packages: Record<string, {version: string; bytes: number}>;
};
