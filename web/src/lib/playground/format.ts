/** What the page shows, as text: the small presentational helpers the components call. */
import type {LastRun, Phase, PlaygroundState} from './session.js';

/** Decimal units, as the sizes are quoted everywhere else (soljson 0.8.28 is 9.2 MB). */
export function formatBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function compilerLabel(compiler: PlaygroundState['compiler'], version: string): string {
	if (compiler.status === 'ready') return `solc ${version}`;
	if (compiler.status === 'failed') return `The Solidity compiler did not load: ${compiler.error ?? 'unknown error'}`;
	if (compiler.loaded >= compiler.total) return `Starting the Solidity compiler (solc ${version})`;
	return `Loading the Solidity compiler (solc ${version}): ${formatBytes(compiler.loaded)} of ${formatBytes(compiler.total)}`;
}

const PHASES: Record<Phase, string> = {
	idle: 'Not started',
	booting: 'Starting',
	ready: 'Ready',
	compiling: 'Compiling the contracts',
	transpiling: 'Preparing the scripts',
	running: 'Running the deploy scripts',
	stopping: 'Stopping',
	sending: 'Sending a transaction',
	resetting: 'Resetting',
	failed: 'Something went wrong',
};

export function phaseLabel(phase: Phase): string {
	return PHASES[phase];
}

export function lastRunLabel(run: LastRun | undefined): string | undefined {
	if (!run) return undefined;
	if (run.outcome === 'stopped') return 'Stopped';
	if (run.outcome === 'failed') return run.stage === 'run' ? 'The run failed' : 'Nothing was sent';
	return run.sent === 0 ? 'Up to date: nothing sent' : `${run.sent} transaction${run.sent === 1 ? '' : 's'} sent`;
}

/** The project's files and the deployment records, each sorted, as the file list shows them. */
export function fileList(state: Pick<PlaygroundState, 'files' | 'records'>): {project: string[]; records: string[]} {
	return {project: Object.keys(state.files).sort(), records: Object.keys(state.records).sort()};
}

export function isRecord(state: Pick<PlaygroundState, 'records'>, path: string): boolean {
	return path in state.records;
}

/** The text of the selected file, whichever list it is in. */
export function selectedText(state: Pick<PlaygroundState, 'files' | 'records' | 'selected'>): string {
	return state.records[state.selected] ?? state.files[state.selected] ?? '';
}
