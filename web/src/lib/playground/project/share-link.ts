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
 * A second encoding, `2.` (`overlay-link.ts`, what rocketh.dev's "Open in playground" buttons
 * write), holds only files to lay over a base and the file to select; `decodeLink` reads either.
 * The base is the starting project, or with `"base": "bare"` the starting project without its
 * Counter sample, so `decodeLink` is given both (`LinkBases`): which one applies is known only once
 * the value is read.
 *
 * A `2.` value holding a key this playground does not read, or a `base` string it does not know,
 * was written for a newer playground: it is refused with a `NewerLinkError`, which asks for a
 * reload (a returning visitor's service worker may have served a cached, older build), and
 * the opener keeps such a link's key in the URL. Every other refusal is a plain `ShareLinkError`.
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
import {OVERLAY_BASES, OVERLAY_VERSION, toBase64URL} from './overlay-link.js';

export {SHARE_FRAGMENT_LIMIT, SHARE_KEY};

const VERSION = '1.';

/** A link that does not hold a project this page can open. */
export class ShareLinkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ShareLinkError';
	}
}

/** A `2.` link this playground cannot read because it was written for a newer one. */
export class NewerLinkError extends ShareLinkError {
	constructor() {
		super('it needs a newer version of the playground than this one; reload the page to open it');
		this.name = 'NewerLinkError';
	}
}

/** How long the fragment of a link holding `value` is: `project=` and the value. */
export const fragmentLength = (value: string) => SHARE_KEY.length + 1 + value.length;

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

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The JSON a value holds after its version prefix: base64url, deflated. */
function inflateJSON(payload: string): unknown {
	let text: string;
	try {
		text = strFromU8(inflateSync(fromBase64URL(payload)));
	} catch {
		throw new ShareLinkError('it is corrupted or cut short');
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new ShareLinkError('it is corrupted or cut short');
	}
}

/** `content` as project files, every path one a link may hold; `empty` says whether none is fine. */
function projectFiles(content: unknown, empty: boolean): ProjectFiles {
	if (!isObject(content)) throw new ShareLinkError('it holds no project files');
	const entries = Object.entries(content);
	if (entries.length === 0 && !empty) throw new ShareLinkError('it holds no project files');
	for (const [path, text] of entries) {
		if (typeof text !== 'string') throw new ShareLinkError(`its file ${path} is not text`);
		if (!isProjectPath(path)) throw new ShareLinkError(`it holds a file at ${JSON.stringify(path)}, which is not a project path`);
	}
	return Object.fromEntries(entries) as ProjectFiles;
}

/** The files a link's `1.` value holds; throws a `ShareLinkError` saying why it cannot. */
export function decodeProject(value: string): ProjectFiles {
	if (!value.startsWith(VERSION)) throw new ShareLinkError('it is not a project link of this playground');
	return projectFiles(inflateJSON(value.slice(VERSION.length)), false);
}

/** What a link opens: the project's files, and the file to select (the first deploy script when none is named). */
export type LinkedProject = {files: ProjectFiles; select?: string};

/** What a `2.` value's files go over: `starting` without `base`, `bare` with `"base": "bare"`. */
export type LinkBases = {starting: ProjectFiles; bare: ProjectFiles};

/** The keys a `2.` payload may hold. */
const OVERLAY_KEYS = ['base', 'files', 'select'];

/**
 * What a `2.` value (`encodeOverlay`) opens: its base (`bases.starting`, or `bases.bare` for
 * `"base": "bare"`) with the value's files over it, and its `select`, which must name one of the
 * resulting files. Throws a `ShareLinkError` saying why it cannot: a `NewerLinkError` for a key
 * or a `base` this playground does not know.
 */
export function decodeOverlay(value: string, bases: LinkBases): LinkedProject {
	if (!value.startsWith(OVERLAY_VERSION)) throw new ShareLinkError('it is not a project link of this playground');
	const content = inflateJSON(value.slice(OVERLAY_VERSION.length));
	if (!isObject(content) || !('files' in content)) throw new ShareLinkError('it holds no project files');
	const {base: name} = content;
	if (name !== undefined && typeof name !== 'string') throw new ShareLinkError(`its base is ${JSON.stringify(name)}, which is not a base's name`);
	if (Object.keys(content).some((key) => !OVERLAY_KEYS.includes(key))) throw new NewerLinkError();
	if (name !== undefined && !(OVERLAY_BASES as readonly string[]).includes(name)) throw new NewerLinkError();
	const base = name === 'bare' ? bases.bare : bases.starting;
	const files = {...base, ...projectFiles(content.files, true)};
	const {select} = content;
	if (select === undefined) return {files};
	if (typeof select !== 'string' || !Object.hasOwn(files, select)) {
		throw new ShareLinkError(`it selects ${JSON.stringify(select)}, which is not one of its files`);
	}
	return {files, select};
}

/** What a link's `project` value opens, in either encoding; `bases` are what a `2.` value goes over. */
export function decodeLink(value: string, bases: LinkBases): LinkedProject {
	return value.startsWith(OVERLAY_VERSION) ? decodeOverlay(value, bases) : {files: decodeProject(value)};
}
