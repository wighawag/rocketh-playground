/** What crosses between the page and the runner worker. Plain, cloneable data only. */
import type {LogEntry} from '@rocketh/playground/log';
import type {ProjectFiles} from '../project/template.js';
import type {RunOutcome} from './run.js';

export type RunnerRequest =
	/**
	 * `provider` is a MessagePort the EVM worker serves (`node.serveOn`), TRANSFERRED here, so the
	 * runner's requests go to the EVM worker directly. `deploymentsDB` names the IndexedDB
	 * database the records persist in; without one they live as long as the runner. `fresh` (the
	 * playground's Reset) empties that store, saved copy included, before the runner is ready.
	 */
	| {type: 'init'; provider: MessagePort; deploymentsDB?: string; fresh?: boolean}
	| {type: 'run'; id: number; modules: ProjectFiles; imports: Record<string, string[]>};

export type RunnerReply =
	/** The deployment store as loaded, every file by path (`deployments/<environment>/...`). */
	| {type: 'ready'; files: ProjectFiles}
	| {type: 'init-failed'; message: string}
	| {type: 'log'; entry: LogEntry}
	| {type: 'store'; change: 'write'; path: string; content: string}
	| {type: 'store'; change: 'delete' | 'delete-folder'; path: string}
	| {type: 'store'; change: 'restore'; files: ProjectFiles}
	| {type: 'done'; id: number; outcome: RunOutcome};
