/** What crosses between the page and the runner worker. Plain, cloneable data only. */
export type LogEntry = {seq: number; source: string; text: string; at: number};

export type RunnerRequest =
	| {type: 'init'; port: MessagePort; db: string}
	| {type: 'run'; modules: Record<string, string>; scripts: string[]};

export type RunnerReply =
	| {type: 'ready'; files: Record<string, string>}
	| {type: 'log'; entry: LogEntry}
	| {type: 'store'; change: 'write' | 'delete' | 'delete-folder'; path: string; content?: string}
	| {type: 'snapshot'; files: Record<string, string>}
	| {type: 'done'; ms: number; counts: Record<string, number>; deployments: Record<string, string>; chainId: number}
	| {type: 'error'; message: string; name?: string; stack?: string; counts: Record<string, number>};
