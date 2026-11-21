/**
 * rocketh writes its transcript (`- Executing 01_deploy_counter.ts`, `reusing "Counter"`) through
 * `named-logs`, whose `logs(name)` hands a library a logger from the factory installed WHEN the
 * library's module is evaluated; with none, the logger stays a no-op for good. So this module
 * must be evaluated before any rocketh module in the runner's realm: `runner.worker.ts` imports it
 * first, and nothing in the runner imports rocketh statically (the packages are loaded per run,
 * `bare-modules.ts`).
 *
 * ONE factory for the life of the realm (a logger keeps the factory it was created from), whose
 * lines go to the stream of the run in progress, and are dropped between runs.
 */
import {createLogFactory, type LogStream} from '@rocketh/playground/log';

let current: LogStream | undefined;

/** Route rocketh's lines to `stream` until the returned function is called. */
export function routeRockethLogs(stream: LogStream): () => void {
	current = stream;
	return () => {
		if (current === stream) current = undefined;
	};
}

const factory = createLogFactory(() => current);
const scope = globalThis as {_logFactory?: unknown};
if (scope._logFactory && scope._logFactory !== factory) {
	// The runner owns its realm; a factory already here means something was loaded first.
	console.warn(
		'a named-logs factory was already installed in the runner; replacing it',
	);
}
// What `named-logs`' `hook()` sets, read by every copy of named-logs, whichever a package resolved.
scope._logFactory = factory;
