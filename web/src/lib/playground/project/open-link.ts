/**
 * Opening a shared link: the project in the page's fragment (`#project=...`, read once at start by
 * `web/src/lib/index.ts`), loaded into the session with `session.open()`, which gives it a fresh
 * chain and no records, as Reset does. Nothing in it runs: the reader presses Deploy for that.
 *
 * Over a project of the reader's own (saved files that are not the starting project), it asks
 * first (`confirm`): Open replaces their files, chain and records, Cancel keeps them and opens
 * nothing. A first visit, or a project still the starting one, opens at once. A link that does not
 * decode is reported and loads nothing.
 *
 * Once the link has been dealt with (opened, cancelled, or found corrupted), its `project` key is
 * removed from the URL (`removeFromURL`, the page's `history.replaceState`), so a reload opens
 * the reader's files as they left them rather than the link again.
 *
 * The decoder (and fflate with it) is imported only when there is a link to open.
 */
import {get, writable, type Readable} from 'svelte/store';
import type {Phase} from '../session.js';
import {startingProject, type ProjectFiles} from './template.js';

/** What opening a link needs of the session. */
export type OpenableSession = Readable<{phase: Phase; files: ProjectFiles}> & {
	open(files: ProjectFiles): Promise<void>;
};

export type LinkState =
	| {status: 'none'}
	/** The link replaces a project of the reader's: waiting for Open or Cancel. */
	| {status: 'confirm'}
	| {status: 'opening'}
	/** The link does not hold a project; nothing was loaded. */
	| {status: 'invalid'; error: string}
	/** The playground did not start, or could not open it. */
	| {status: 'failed'; error: string};

export type LinkOpener = Readable<LinkState> & {
	/** Once, after the session has been started: decode, wait for it to be ready, open or ask. */
	begin(): Promise<void>;
	/** The reader's Open. */
	confirm(): Promise<void>;
	/** The reader's Cancel: their project stays, the link opens nothing. */
	cancel(): void;
	/** Hide a report. */
	dismiss(): void;
};

export type LinkOpenerOptions = {
	session: OpenableSession;
	/** The fragment's `project` value, if the page was opened with one. */
	value: string | undefined;
	removeFromURL(): void;
	/** What counts as no project of the reader's own (default: the starting project). */
	starting?: ProjectFiles;
};

const sameFiles = (a: ProjectFiles, b: ProjectFiles) => {
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((k) => k in b && a[k] === b[k]);
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Resolves with the session's phase once it is `ready` or `failed`. */
function settled(session: OpenableSession): Promise<Phase> {
	return new Promise((resolve) => {
		let done = false;
		let unsubscribe: (() => void) | undefined;
		unsubscribe = session.subscribe(({phase}) => {
			if (done || (phase !== 'ready' && phase !== 'failed')) return;
			done = true;
			resolve(phase);
			unsubscribe?.();
		});
		if (done) unsubscribe();
	});
}

export function createLinkOpener(options: LinkOpenerOptions): LinkOpener {
	const store = writable<LinkState>({status: 'none'});
	let files: ProjectFiles | undefined;
	let removed = false;
	const removeFromURL = () => {
		if (removed) return;
		removed = true;
		options.removeFromURL();
	};

	async function open() {
		store.set({status: 'opening'});
		await options.session.open(files!);
		const {phase, files: now} = get(options.session);
		if (phase === 'ready' && now === files) {
			removeFromURL();
			store.set({status: 'none'});
		} else {
			store.set({status: 'failed', error: 'the playground could not open it'});
		}
	}

	async function begin() {
		if (options.value === undefined) return;
		try {
			const {decodeProject} = await import('./share-link.js');
			files = decodeProject(options.value);
		} catch (error) {
			removeFromURL();
			store.set({status: 'invalid', error: messageOf(error)});
			return;
		}
		if ((await settled(options.session)) !== 'ready') {
			// kept in the URL: a reload, once the playground starts, can still open it
			store.set({status: 'failed', error: 'the playground did not start'});
			return;
		}
		if (sameFiles(get(options.session).files, options.starting ?? startingProject())) await open();
		else store.set({status: 'confirm'});
	}

	async function confirm() {
		if (get(store).status !== 'confirm') return;
		await open();
	}

	function cancel() {
		if (get(store).status !== 'confirm') return;
		removeFromURL();
		store.set({status: 'none'});
	}

	function dismiss() {
		const {status} = get(store);
		if (status === 'invalid' || status === 'failed') store.set({status: 'none'});
	}

	return {subscribe: store.subscribe, begin, confirm, cancel, dismiss};
}
