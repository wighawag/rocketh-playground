/**
 * The header's Share: the project's files as a link, copied to the clipboard and shown, so it can
 * be copied by hand when the clipboard refuses. The files travel in the link's fragment, which
 * the browser never sends to a server.
 *
 * Above the cap (`SHARE_FRAGMENT_LIMIT`, 32 KB of fragment), there is no link: Share says so and
 * the page offers Download instead.
 *
 * The encoder is `share-link.ts`, imported here on the first press so that fflate is not part of
 * the page's first load.
 */
import {writable, type Readable} from 'svelte/store';
import type {ProjectFiles} from './template';
import {canDownload} from './download';
import {SHARE_FRAGMENT_LIMIT} from './link-fragment';

/** Share has the same files to work from as Download: once they are open, not during a Reset. */
export const canShare = canDownload;

/** Why a project gets no link, as the page says it. */
export function tooBigLabel(
	length: number,
	limit = SHARE_FRAGMENT_LIMIT,
): string {
	const kb = (n: number) => `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} KB`;
	return `This project is too big for a link: its link would carry ${kb(length)}, and a link carries at most ${kb(limit)}. Download it instead.`;
}

export type ShareState =
	| {status: 'idle'}
	| {status: 'building'}
	/** `copied` is false when the clipboard refused it: the reader copies it from the page. */
	| {status: 'shared'; link: string; copied: boolean}
	/** How long the link's fragment would have been, over the cap. */
	| {status: 'too-big'; length: number}
	| {status: 'failed'; error: string};

export type ProjectShare = Readable<ShareState> & {
	share(files: ProjectFiles): Promise<void>;
	/** Back to idle, as when the reader closes what Share showed. */
	close(): void;
};

export type ShareOptions = {
	/** The page's URL, which the link points at with its fragment replaced. */
	href?: () => string;
	/** Put `text` on the clipboard; false when the browser refuses. */
	copy?: (text: string) => Promise<boolean>;
};

const copyInBrowser = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
};

export function createProjectShare(options: ShareOptions = {}): ProjectShare {
	const href = options.href ?? (() => location.href);
	const copy = options.copy ?? copyInBrowser;
	const store = writable<ShareState>({status: 'idle'});
	let building = false;

	async function share(files: ProjectFiles) {
		if (building) return;
		building = true;
		store.set({status: 'building'});
		try {
			const {shareProject, shareURL} = await import('./share-link');
			const shared = shareProject(files);
			if (!shared.ok) {
				store.set({status: 'too-big', length: shared.length});
				return;
			}
			const link = shareURL(href(), shared.value);
			store.set({status: 'shared', link, copied: await copy(link)});
		} catch (error) {
			store.set({
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			building = false;
		}
	}

	return {
		subscribe: store.subscribe,
		share,
		close: () => store.set({status: 'idle'}),
	};
}
