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
 * the reader's files as they left them rather than the link again. Two cases keep it, so a reload
 * can still open the link: the playground did not start, and a `2.` link written for a newer
 * playground (`NewerLinkError`), which is reported as asking for a reload.
 *
 * A link holds the whole project (`1.`) or files over a base and the file to select (`2.`,
 * rocketh.dev's "Open in playground"); both open the same way, the second with that file
 * selected (`decodeLink`). A `2.` link's base is the starting project, or with `"base": "bare"`
 * the starting project without its Counter sample (`bareProject()`). Either way, "no project of the
 * reader's own" still means the starting project.
 *
 * The decoder (and fflate with it) is imported only when there is a link to open.
 */
import {get, writable, type Readable} from 'svelte/store';
import type {Phase} from '../session.js';
import {bareProject, startingProject, type ProjectFiles} from './template.js';

/** What opening a link needs of the session. */
export type OpenableSession = Readable<{phase: Phase; files: ProjectFiles}> & {
	open(files: ProjectFiles, selected?: string): Promise<void>;
};

export type LinkState =
	| {status: 'none'}
	/** The link replaces a project of the reader's: waiting for Open or Cancel. */
	| {status: 'confirm'}
	| {status: 'opening'}
	/** The link does not hold a project; nothing was loaded. */
	| {status: 'invalid'; error: string}
	/** The playground did not start, could not open it, or is older than the link: the key is kept unless opening failed. */
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
	/**
	 * What counts as no project of the reader's own, and what a `2.` link without `base` goes over
	 * (default: the starting project).
	 */
	starting?: ProjectFiles;
	/** What a `2.` link with `"base": "bare"` goes over (default: `bareProject()`). */
	bare?: ProjectFiles;
};

const sameFiles = (a: ProjectFiles, b: ProjectFiles) => {
	const keys = Object.keys(a);
	return (
		keys.length === Object.keys(b).length &&
		keys.every((k) => k in b && a[k] === b[k])
	);
};

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

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
	let selected: string | undefined;
	const starting = options.starting ?? startingProject();
	const bare = options.bare ?? bareProject();
	let removed = false;
	const removeFromURL = () => {
		if (removed) return;
		removed = true;
		options.removeFromURL();
	};

	async function open() {
		store.set({status: 'opening'});
		await options.session.open(files!, selected);
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
		let shareLink: typeof import('./share-link.js') | undefined;
		try {
			shareLink = await import('./share-link.js');
			({files, select: selected} = shareLink.decodeLink(options.value, {
				starting,
				bare,
			}));
		} catch (error) {
			if (shareLink && error instanceof shareLink.NewerLinkError) {
				// kept in the URL: a reload may get a playground new enough to open it
				store.set({status: 'failed', error: error.message});
				return;
			}
			removeFromURL();
			store.set({status: 'invalid', error: messageOf(error)});
			return;
		}
		if ((await settled(options.session)) !== 'ready') {
			// kept in the URL: a reload, once the playground starts, can still open it
			store.set({status: 'failed', error: 'the playground did not start'});
			return;
		}
		if (sameFiles(get(options.session).files, starting)) await open();
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
		if (status === 'invalid' || status === 'failed')
			store.set({status: 'none'});
	}

	return {subscribe: store.subscribe, begin, confirm, cancel, dismiss};
}
