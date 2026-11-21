/**
 * The `2.` link encoding, in node: files over the starting project (or over the bare one, without
 * its Counter sample) and the file to select, as rocketh.dev's "Open in playground" buttons write
 * it. rocketh-website hand-ports the encoder and holds it to `overlay-link-vector.json` and
 * `overlay-link-bare-vector.json`, so both vectors are reproduced here byte for byte.
 */
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deflateSync, strToU8} from 'fflate';
import {
	encodeOverlay,
	OVERLAY_FRAGMENT_LIMIT,
	toBase64URL,
} from '../../../src/lib/playground/project/overlay-link.js';
import {
	decodeLink,
	decodeOverlay,
	encodeProject,
	fragmentLength,
	NewerLinkError,
	SHARE_FRAGMENT_LIMIT,
	ShareLinkError,
} from '../../../src/lib/playground/project/share-link.js';
import {
	bareProject,
	COUNTER_SAMPLE_PATHS,
	startingProject,
	STARTING_PROJECT_PATHS,
	TEMPLATE_FILES,
} from '../../../src/lib/playground/project/template.js';

const vector = JSON.parse(
	readFileSync(new URL('./overlay-link-vector.json', import.meta.url), 'utf8'),
) as {
	files: Record<string, string>;
	select: string;
	value: string;
};

const bareVector = JSON.parse(
	readFileSync(
		new URL('./overlay-link-bare-vector.json', import.meta.url),
		'utf8',
	),
) as {
	files: Record<string, string>;
	select: string;
	base: 'bare';
	value: string;
};

/** Text that hardly compresses (xorshift32 over 90 printable characters). */
function incompressible(chars: number): string {
	let text = '';
	let seed = 2463534242;
	while (text.length < chars) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		text += String.fromCharCode(33 + ((seed >>> 0) % 90));
	}
	return text;
}

/** A `2.` value holding `content` as it is, valid or not: what a hand-made link could hold. */
const raw = (content: unknown) =>
	'2.' + toBase64URL(deflateSync(strToU8(JSON.stringify(content)), {level: 9}));

const base = startingProject();
const bare = bareProject();
const bases = {starting: base, bare};

describe('the bare base', () => {
	it("is the starting project without its Counter sample, the template's files as they are", () => {
		expect(COUNTER_SAMPLE_PATHS).toEqual([
			'contracts/Counter.sol',
			'deploy/01_deploy_counter.ts',
		]);
		for (const path of COUNTER_SAMPLE_PATHS)
			expect(STARTING_PROJECT_PATHS).toContain(path);
		expect(Object.keys(bare).sort()).toEqual([
			'rocketh/config.ts',
			'rocketh/deploy.ts',
		]);
		for (const [path, text] of Object.entries(bare))
			expect(text, path).toBe(TEMPLATE_FILES[path]);
		// a fresh object every call, as startingProject() gives
		expect(bareProject()).not.toBe(bare);
		expect(bareProject()).toEqual(bare);
	});
});

describe('the `2.` link encoding', () => {
	it('reproduces the shared test vector exactly', () => {
		expect(vector.value).toMatch(/^2\.[A-Za-z0-9_-]+$/);
		expect(encodeOverlay(vector.files, vector.select)).toBe(vector.value);
	});

	it('reproduces the bare test vector exactly: the same files and select, with `base: "bare"`', () => {
		expect(bareVector.base).toBe('bare');
		expect(bareVector.files).toEqual(vector.files);
		expect(bareVector.select).toBe(vector.select);
		expect(
			encodeOverlay(bareVector.files, bareVector.select, {base: 'bare'}),
		).toBe(bareVector.value);
		// no base, or an undefined one, is the existing link exactly
		expect(encodeOverlay(vector.files, vector.select, {})).toBe(vector.value);
		expect(encodeOverlay(vector.files, vector.select, {base: undefined})).toBe(
			vector.value,
		);
	});

	it('opens the bare vector as its files over the bare base, its file selected', () => {
		expect(decodeLink(bareVector.value, bases)).toEqual({
			files: {...bare, ...bareVector.files},
			select: bareVector.select,
		});
		expect(
			Object.keys(decodeLink(bareVector.value, bases).files),
		).not.toContain('contracts/Counter.sol');
	});

	it('round-trips a bare link, one with no files at all included', () => {
		const files = {
			'rocketh/config.ts': '// my config\n',
			'contracts/Notes.sol': '// é, 你好\n',
		};
		expect(
			decodeOverlay(
				encodeOverlay(files, 'rocketh/deploy.ts', {base: 'bare'}),
				bases,
			),
		).toEqual({files: {...bare, ...files}, select: 'rocketh/deploy.ts'});
		expect(
			decodeOverlay(encodeOverlay({}, undefined, {base: 'bare'}), bases),
		).toEqual({files: bare});
		// a bare link cannot select a file only the starting project holds
		expect(() =>
			decodeOverlay(
				encodeOverlay({}, 'contracts/Counter.sol', {base: 'bare'}),
				bases,
			),
		).toThrow(ShareLinkError);
	});

	it('refuses to encode a base it does not know', () => {
		for (const other of ['starting', 'BARE', '', null, 1]) {
			expect(() =>
				encodeOverlay(vector.files, vector.select, {base: other as 'bare'}),
			).toThrow(/base/);
		}
	});

	it('refuses a link from a newer playground (an unknown key, or an unknown `base`) as needing a reload', () => {
		for (const content of [
			{files: {}, extra: 1},
			{files: {}, base: 'bare', theme: 'dark'},
			{files: {}, base: 'minimal'},
			{files: {}, base: ''},
		]) {
			expect(() => decodeOverlay(raw(content), bases)).toThrow(NewerLinkError);
			expect(() => decodeOverlay(raw(content), bases)).toThrow(
				'it needs a newer version of the playground than this one; reload the page to open it',
			);
		}
		// a `base` that is not a string is a corrupted link, not a newer one
		for (const base of [null, 1, true, ['bare'], {name: 'bare'}]) {
			let error: unknown;
			try {
				decodeOverlay(raw({files: {}, base}), bases);
			} catch (e) {
				error = e;
			}
			expect(error).toBeInstanceOf(ShareLinkError);
			expect(error).not.toBeInstanceOf(NewerLinkError);
		}
	});

	it('gives the same value whatever order the files are given in', () => {
		const reversed = Object.fromEntries(Object.entries(vector.files).reverse());
		expect(Object.keys(reversed)).not.toEqual(Object.keys(vector.files));
		expect(encodeOverlay(reversed, vector.select)).toBe(vector.value);
		// integer-like keys too, which JSON.stringify would write first
		expect(encodeOverlay({b: 'x', '1': 'y'})).toBe(
			encodeOverlay({'1': 'y', b: 'x'}),
		);
	});

	it('opens the starting project with its files over it and its file selected', () => {
		const opened = decodeLink(vector.value, bases);
		expect(opened).toEqual({
			files: {...base, ...vector.files},
			select: vector.select,
		});
	});

	it('round-trips files over the starting project, one replaced, unicode and an empty file included', () => {
		const files = {
			'deploy/01_deploy_counter.ts': '// replaced\n',
			'contracts/Notes.sol': '// é, ü, 你好, 🚀\n',
			'deploy/empty.ts': '',
		};
		expect(
			decodeOverlay(encodeOverlay(files, 'contracts/Notes.sol'), bases),
		).toEqual({files: {...base, ...files}, select: 'contracts/Notes.sol'});
		// no select: the session picks the first deploy script
		expect(decodeOverlay(encodeOverlay(files), bases)).toEqual({
			files: {...base, ...files},
		});
		// select may name a file of the starting project the link leaves as it is
		expect(
			decodeOverlay(encodeOverlay(files, 'rocketh/config.ts'), bases).select,
		).toBe('rocketh/config.ts');
		// no files at all: the starting project
		expect(decodeOverlay(encodeOverlay({}), bases)).toEqual({files: base});
	});

	it('still opens a `1.` link as the whole project', () => {
		const files = {...base, 'deploy/02.ts': '// mine\n'};
		expect(decodeLink(encodeProject(files), bases)).toEqual({files});
	});

	it('refuses a link whose fragment would be over 32 KB, saying how big it would be', () => {
		expect(OVERLAY_FRAGMENT_LIMIT).toBe(SHARE_FRAGMENT_LIMIT);
		let under: number | undefined;
		let over: number | undefined;
		for (
			let chars = 26_000;
			chars < 36_000 && over === undefined;
			chars += 50
		) {
			try {
				const value = encodeOverlay({'contracts/A.sol': incompressible(chars)});
				expect(fragmentLength(value)).toBeLessThanOrEqual(SHARE_FRAGMENT_LIMIT);
				under = chars;
			} catch (error) {
				expect((error as Error).message).toMatch(
					/^this link would carry \d+ bytes of fragment, over the 32768 a link carries$/,
				);
				over = chars;
			}
		}
		expect(under).toBeDefined();
		expect(over).toBeDefined();
	});

	it('refuses a corrupted, a truncated or a foreign value', () => {
		const value = vector.value;
		const corrupted =
			value.slice(0, 40) + (value[40] === 'A' ? 'B' : 'A') + value.slice(41);
		for (const bad of [
			corrupted,
			value.slice(0, Math.floor(value.length / 2)),
			'2.',
			'2.!!!',
			'3.' + value.slice(2),
		]) {
			expect(() => decodeLink(bad, bases)).toThrow(ShareLinkError);
		}
		// a `1.` payload under the `2.` prefix
		expect(() =>
			decodeLink('2.' + encodeProject(base).slice(2), bases),
		).toThrow(ShareLinkError);
	});

	it('refuses a path the rules refuse, as a `1.` link does', () => {
		for (const path of [
			'/etc/passwd',
			'../outside.ts',
			'deploy/../../x.ts',
			'a\\b.ts',
			'deployments/playground/A.json',
		]) {
			expect(() => decodeOverlay(encodeOverlay({[path]: 'x'}), bases)).toThrow(
				ShareLinkError,
			);
		}
	});

	it('refuses a `select` that names no file of the resulting project', () => {
		expect(() =>
			decodeOverlay(encodeOverlay({'deploy/02.ts': ''}, 'deploy/03.ts'), bases),
		).toThrow(
			new ShareLinkError(
				'it selects "deploy/03.ts", which is not one of its files',
			),
		);
		for (const select of [1, null, 'toString', '']) {
			expect(() => decodeOverlay(raw({files: {}, select}), bases)).toThrow(
				ShareLinkError,
			);
		}
	});

	it('refuses content that is not files and a select', () => {
		for (const content of [
			[],
			'text',
			{},
			{files: []},
			{files: {'a.ts': 1}},
			{files: {}, extra: 1},
			{files: {}, base: 1},
		]) {
			expect(() => decodeOverlay(raw(content), bases)).toThrow(ShareLinkError);
		}
	});
});
