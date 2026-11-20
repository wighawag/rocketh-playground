/**
 * The project in a link: Share writes the project's files into the URL fragment, which a browser
 * never sends to a server, and opening a link reads them back.
 *
 * The page reads its fragment as `key=value` pairs (`getHashParamsFromLocation`), so the project
 * is the value of one key, `project`: `#project=1.<base64url>`. The `1.` names this encoding (the
 * files as JSON, deflated with fflate, in base64url without padding), so that a later one can be
 * told apart; `.` is not a base64url character. Every character of the value is one the URL and
 * the `key=value` reading leave as it is (no `=`, `&`, `+` or `/`).
 *
 * A link carries at most `SHARE_FRAGMENT_LIMIT` (32 KB, the spec's Decision) of fragment, measured
 * as the fragment is written (`project=` and the value): above it, Share offers the zip instead.
 *
 * Decoding only reads data: the files go into the editor, and nothing in them runs until the
 * reader presses Deploy. A value that does not decode to a set of project files is refused whole.
 *
 * fflate is imported here, so the page imports this module on demand (Share's first press, or a
 * link to open), as Download does with `export-project.ts`.
 */
import {deflateSync, inflateSync, strFromU8, strToU8} from 'fflate';
import type {ProjectFiles} from './template.js';
import {SHARE_FRAGMENT_LIMIT, SHARE_KEY} from './link-fragment.js';

export {SHARE_FRAGMENT_LIMIT, SHARE_KEY};

const VERSION = '1.';

/** A link that does not hold a project this page can open. */
export class ShareLinkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ShareLinkError';
	}
}

/** How long the fragment of a link holding `value` is: `project=` and the value. */
export const fragmentLength = (value: string) => SHARE_KEY.length + 1 + value.length;

function toBase64URL(bytes: Uint8Array): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64URL(text: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new ShareLinkError('it is not base64url');
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** The value of the fragment's `project` key for `files`, whatever its length. */
export function encodeProject(files: ProjectFiles): string {
	return VERSION + toBase64URL(deflateSync(strToU8(JSON.stringify(files)), {level: 9}));
}

export type SharedProject = {ok: true; value: string} | {ok: false; length: number};

/** The `project` value for `files`, or how long its fragment would be when that is over the cap. */
export function shareProject(files: ProjectFiles): SharedProject {
	const value = encodeProject(files);
	const length = fragmentLength(value);
	return length <= SHARE_FRAGMENT_LIMIT ? {ok: true, value} : {ok: false, length};
}

/** The link to `value` from the page at `href`: the page's URL with its fragment replaced. */
export function shareURL(href: string, value: string): string {
	const url = new URL(href);
	url.hash = `${SHARE_KEY}=${value}`;
	return url.href;
}

/**
 * Whether `path` may be a project file from a link: relative, `/`-separated, no `..` (the zip
 * export writes it under one folder), and not a deployment record (those are the chain's).
 */
function isProjectPath(path: string): boolean {
	if (path === '' || path.startsWith('/') || path.includes('\\')) return false;
	const segments = path.split('/');
	if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
	return segments[0] !== 'deployments';
}

/** The files a link's `project` value holds; throws a `ShareLinkError` saying why it cannot. */
export function decodeProject(value: string): ProjectFiles {
	if (!value.startsWith(VERSION)) throw new ShareLinkError('it is not a project link of this playground');
	let text: string;
	try {
		text = strFromU8(inflateSync(fromBase64URL(value.slice(VERSION.length))));
	} catch {
		throw new ShareLinkError('it is corrupted or cut short');
	}
	let content: unknown;
	try {
		content = JSON.parse(text);
	} catch {
		throw new ShareLinkError('it is corrupted or cut short');
	}
	if (typeof content !== 'object' || content === null || Array.isArray(content)) {
		throw new ShareLinkError('it holds no project files');
	}
	const entries = Object.entries(content);
	if (entries.length === 0) throw new ShareLinkError('it holds no project files');
	for (const [path, text] of entries) {
		if (typeof text !== 'string') throw new ShareLinkError(`its file ${path} is not text`);
		if (!isProjectPath(path)) throw new ShareLinkError(`it holds a file at ${JSON.stringify(path)}, which is not a project path`);
	}
	return Object.fromEntries(entries) as ProjectFiles;
}
