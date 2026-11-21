/**
 * The browser's four workers, for `createPlaygroundSession`. Each `new Worker(new URL(...))` is
 * written out in full because that is the pattern Vite recognises to bundle a worker.
 */
import type {PlaygroundWorkers, WorkerLike} from './session.js';

export function browserWorkers(): PlaygroundWorkers {
	return {
		typescript: () =>
			new Worker(
				new URL('./typescript/typescript.worker.ts', import.meta.url),
				{type: 'module', name: 'typescript'},
			) as WorkerLike,
		// CLASSIC: no {type: 'module'}, because soljson is loaded with importScripts.
		compiler: () =>
			new Worker(new URL('./compiler/compiler.worker.ts', import.meta.url), {
				name: 'compiler',
			}) as WorkerLike,
		evm: () =>
			new Worker(new URL('./evm/evm.worker.ts', import.meta.url), {
				type: 'module',
				name: 'evm',
			}) as WorkerLike,
		runner: () =>
			new Worker(new URL('./runner/runner.worker.ts', import.meta.url), {
				type: 'module',
				name: 'runner',
			}) as WorkerLike,
	};
}
