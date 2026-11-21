/**
 * The `2.` link encoding, the one "Open in playground" buttons on rocketh.dev produce: some files
 * over a base project, and the file to select.
 *
 * `encodeOverlay(files, select, {base})` is the value of the fragment's `project` key: `2.` then
 * the JSON `{"base": "bare", "files": {<path>: <text>}, "select": <path>}`, deflated with fflate at
 * level 9, in base64url without padding. `base` is written only when it is `"bare"` and `select`
 * only when there is one, so a link without them is exactly the link written before `base` existed.
 * Keys are written in sorted order (by UTF-16 code unit, JavaScript's default `sort()`), so the same
 * input always gives the same value.
 *
 * The base is what the files go over when the link is opened: without `base`, the starting
 * project (`startingProject()` in `template.ts`); with `"base": "bare"`, the starting project
 * without its Counter sample (`bareProject()`), which is what rocketh.dev's links ask for. What
 * "bare" holds is the playground's to define; a link only names it.
 *
 * rocketh-website keeps a hand port of this encoder with JSDoc types
 * (`web/open-in-playground/overlay-link.js`) and a copy of the decoder in its tests, both held to
 * the shared test vectors `web/test/lib/playground/overlay-link-vector.json` (no base) and
 * `overlay-link-bare-vector.json` (`"base": "bare"`). This file depends on nothing but fflate so
 * that port stays small. A change to the encoding changes the vectors, and both repositories,
 * together.
 *
 * It refuses (throws) a `base` other than `undefined` or `'bare'` (the port is plain JavaScript,
 * with no type check), and a value whose fragment (`project=` and the value) would be over 32 KB,
 * the cap every shared link has (`SHARE_FRAGMENT_LIMIT`), so a site build fails on such an example.
 * The path rules and `select` are checked when the link is opened (`decodeLink` in
 * `share-link.ts`), against the base the playground holds.
 */
import {deflateSync, strToU8} from 'fflate';

export const OVERLAY_VERSION = '2.';

/** The most fragment a link carries, `project=<value>` as written: 32 KB. */
export const OVERLAY_FRAGMENT_LIMIT = 32 * 1024;

export function toBase64URL(bytes: Uint8Array): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK)
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
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

/** The bases a `2.` link may name; without one, it opens over the starting project. */
export const OVERLAY_BASES = ['bare'] as const;
export type OverlayBase = (typeof OVERLAY_BASES)[number];

export type OverlayOptions = {
	/** `'bare'`: open over the starting project without its Counter sample. */
	base?: OverlayBase;
};

/** The `project` value opening the base (`options.base`) with `files` over it and `select` selected. */
export function encodeOverlay(
	files: Record<string, string>,
	select?: string,
	options: OverlayOptions = {},
): string {
	const {base} = options;
	if (
		base !== undefined &&
		!(OVERLAY_BASES as readonly unknown[]).includes(base)
	) {
		throw new Error(
			`a link's base is ${OVERLAY_BASES.map((b) => JSON.stringify(b)).join(' or ')}, or none, not ${JSON.stringify(base)}`,
		);
	}
	const value =
		OVERLAY_VERSION +
		toBase64URL(
			deflateSync(strToU8(sortedJSON({base, files, select})), {level: 9}),
		);
	const length = 'project='.length + value.length;
	if (length > OVERLAY_FRAGMENT_LIMIT) {
		throw new Error(
			`this link would carry ${length} bytes of fragment, over the ${OVERLAY_FRAGMENT_LIMIT} a link carries`,
		);
	}
	return value;
}
