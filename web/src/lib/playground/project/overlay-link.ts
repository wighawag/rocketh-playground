/**
 * The `2.` link encoding, the one "Open in playground" buttons on rocketh.dev produce: some files
 * over the playground's starting project, and the file to select.
 *
 * `encodeOverlay(files, select)` is the value of the fragment's `project` key: `2.` then the JSON
 * `{"files": {<path>: <text>}, "select": <path>}` (`select` left out when there is none), deflated
 * with fflate at level 9, in base64url without padding. Keys are written in sorted order (by
 * UTF-16 code unit, JavaScript's default `sort()`), so the same input always gives the same value.
 *
 * rocketh-website keeps a copy of THIS FILE, as it is, held to the shared test vector
 * `web/test/lib/playground/overlay-link-vector.json`: it depends on nothing but fflate for that
 * reason. A change to the encoding changes the vector, and both repositories, together.
 *
 * It refuses (throws) a value whose fragment (`project=` and the value) would be over 32 KB, the
 * cap every shared link has (`SHARE_FRAGMENT_LIMIT`), so a site build fails on such an example.
 * The path rules and `select` are checked when the link is opened (`decodeLink` in
 * `share-link.ts`), against the starting project the playground holds.
 */
import {deflateSync, strToU8} from 'fflate';

export const OVERLAY_VERSION = '2.';

/** The most fragment a link carries, `project=<value>` as written: 32 KB. */
export const OVERLAY_FRAGMENT_LIMIT = 32 * 1024;

export function toBase64URL(bytes: Uint8Array): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JSON with every object's keys in sorted order (`JSON.stringify` would put integer-like keys first). */
function sortedJSON(value: unknown): string {
	if (typeof value !== 'object' || value === null) return JSON.stringify(value);
	const object = value as Record<string, unknown>;
	const keys = Object.keys(object)
		.filter((key) => object[key] !== undefined)
		.sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${sortedJSON(object[key])}`).join(',')}}`;
}

/** The `project` value opening the starting project with `files` over it and `select` selected. */
export function encodeOverlay(files: Record<string, string>, select?: string): string {
	const value = OVERLAY_VERSION + toBase64URL(deflateSync(strToU8(sortedJSON({files, select})), {level: 9}));
	const length = 'project='.length + value.length;
	if (length > OVERLAY_FRAGMENT_LIMIT) {
		throw new Error(`this link would carry ${length} bytes of fragment, over the ${OVERLAY_FRAGMENT_LIMIT} a link carries`);
	}
	return value;
}
