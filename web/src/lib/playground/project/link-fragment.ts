/**
 * Where a shared link keeps the project: the value of one key of the URL fragment, which the page
 * reads as `key=value` pairs (`getHashParamsFromLocation`). Kept apart from `share-link.ts` (the
 * encoding, with fflate) so the page can name the key and the cap without loading fflate.
 */

/** The fragment's key that holds the project: `#project=...`. */
export const SHARE_KEY = 'project';

/** The most fragment a shared link carries: 32 KB, as `project=<value>` is written (the spec's Decision). */
export const SHARE_FRAGMENT_LIMIT = 32 * 1024;

/** `href` without the fragment's `key`; the other `key=value` pairs are kept as they are written. */
export function withoutFragmentKey(href: string, key: string): string {
	const hash = href.indexOf('#');
	if (hash === -1) return href;
	const kept = href
		.slice(hash + 1)
		.split('&')
		.filter((piece) => piece !== '' && decodeURIComponent(piece.split('=')[0]) !== key);
	return href.slice(0, hash) + (kept.length > 0 ? `#${kept.join('&')}` : '');
}
