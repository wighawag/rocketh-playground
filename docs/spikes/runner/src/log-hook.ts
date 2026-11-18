/**
 * rocketh writes its transcript ("- Executing 01_deploy_counter.ts", `reusing "Counter"`) through
 * `named-logs`, whose `logs(name)` returns a no-op logger unless a factory was hooked BEFORE the
 * module that calls it was evaluated: the call is at module scope (`const logger = logs('rocketh')`
 * in `rocketh/src/internal/logging.ts`), so hooking later changes nothing.
 *
 * So this module is the runner's FIRST import, and it hooks through `globalThis._logFactory`
 * (what `named-logs`' `hook()` sets), which `named-logs` reads in both versions installed, 0.3.2
 * and 0.4.1, so it does not matter which copy a package was bundled with.
 */
type Sink = (namespace: string, level: string, args: unknown[]) => void;

let sink: Sink = () => {};
export function setLogSink(next: Sink) {
	sink = next;
}

const LEVELS = ['assert', 'error', 'warn', 'info', 'log', 'debug', 'dir', 'table', 'trace', 'write', 'time', 'timeEnd', 'timeLog'];
// `debug` and below stay quiet, as rocketh's CLI does by default.
const SHOWN = new Set(['error', 'warn', 'info', 'log', 'write']);

(globalThis as {_logFactory?: unknown})._logFactory = (namespace: string) => {
	const logger: Record<string, (...args: unknown[]) => void> = {};
	for (const level of LEVELS) {
		logger[level] = SHOWN.has(level) ? (...args: unknown[]) => sink(namespace, level, args) : () => {};
	}
	return logger;
};
