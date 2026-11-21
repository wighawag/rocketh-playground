/**
 * The `2.` link encoding, in node: files over the starting project and the file to select, as
 * rocketh.dev's "Open in playground" buttons write it. rocketh-website keeps a copy of the encoder
 * held to `overlay-link-vector.json`, so the vector is reproduced here byte for byte.
 */
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deflateSync, strToU8} from 'fflate';
import {encodeOverlay, OVERLAY_FRAGMENT_LIMIT, toBase64URL} from '../../../src/lib/playground/project/overlay-link.js';
import {decodeLink, decodeOverlay, encodeProject, fragmentLength, SHARE_FRAGMENT_LIMIT, ShareLinkError} from '../../../src/lib/playground/project/share-link.js';
import {startingProject} from '../../../src/lib/playground/project/template.js';

const vector = JSON.parse(readFileSync(new URL('./overlay-link-vector.json', import.meta.url), 'utf8')) as {
	files: Record<string, string>;
	select: string;
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
const raw = (content: unknown) => '2.' + toBase64URL(deflateSync(strToU8(JSON.stringify(content)), {level: 9}));

const base = startingProject();

describe('the `2.` link encoding', () => {
	it('reproduces the shared test vector exactly', () => {
		expect(vector.value).toMatch(/^2\.[A-Za-z0-9_-]+$/);
		expect(encodeOverlay(vector.files, vector.select)).toBe(vector.value);
	});

	it('gives the same value whatever order the files are given in', () => {
		const reversed = Object.fromEntries(Object.entries(vector.files).reverse());
		expect(Object.keys(reversed)).not.toEqual(Object.keys(vector.files));
		expect(encodeOverlay(reversed, vector.select)).toBe(vector.value);
		// integer-like keys too, which JSON.stringify would write first
		expect(encodeOverlay({b: 'x', '1': 'y'})).toBe(encodeOverlay({'1': 'y', b: 'x'}));
	});

	it('opens the starting project with its files over it and its file selected', () => {
		const opened = decodeLink(vector.value, base);
		expect(opened).toEqual({files: {...base, ...vector.files}, select: vector.select});
	});

	it('round-trips files over the starting project, one replaced, unicode and an empty file included', () => {
		const files = {'deploy/01_deploy_counter.ts': '// replaced\n', 'contracts/Notes.sol': '// é, ü, 你好, 🚀\n', 'deploy/empty.ts': ''};
		expect(decodeOverlay(encodeOverlay(files, 'contracts/Notes.sol'), base)).toEqual({files: {...base, ...files}, select: 'contracts/Notes.sol'});
		// no select: the session picks the first deploy script
		expect(decodeOverlay(encodeOverlay(files), base)).toEqual({files: {...base, ...files}});
		// select may name a file of the starting project the link leaves as it is
		expect(decodeOverlay(encodeOverlay(files, 'rocketh/config.ts'), base).select).toBe('rocketh/config.ts');
		// no files at all: the starting project
		expect(decodeOverlay(encodeOverlay({}), base)).toEqual({files: base});
	});

	it('still opens a `1.` link as the whole project', () => {
		const files = {...base, 'deploy/02.ts': '// mine\n'};
		expect(decodeLink(encodeProject(files), base)).toEqual({files});
	});

	it('refuses a link whose fragment would be over 32 KB, saying how big it would be', () => {
		expect(OVERLAY_FRAGMENT_LIMIT).toBe(SHARE_FRAGMENT_LIMIT);
		let under: number | undefined;
		let over: number | undefined;
		for (let chars = 26_000; chars < 36_000 && over === undefined; chars += 50) {
			try {
				const value = encodeOverlay({'contracts/A.sol': incompressible(chars)});
				expect(fragmentLength(value)).toBeLessThanOrEqual(SHARE_FRAGMENT_LIMIT);
				under = chars;
			} catch (error) {
				expect((error as Error).message).toMatch(/^this link would carry \d+ bytes of fragment, over the 32768 a link carries$/);
				over = chars;
			}
		}
		expect(under).toBeDefined();
		expect(over).toBeDefined();
	});

	it('refuses a corrupted, a truncated or a foreign value', () => {
		const value = vector.value;
		const corrupted = value.slice(0, 40) + (value[40] === 'A' ? 'B' : 'A') + value.slice(41);
		for (const bad of [corrupted, value.slice(0, Math.floor(value.length / 2)), '2.', '2.!!!', '3.' + value.slice(2)]) {
			expect(() => decodeLink(bad, base)).toThrow(ShareLinkError);
		}
		// a `1.` payload under the `2.` prefix
		expect(() => decodeLink('2.' + encodeProject(base).slice(2), base)).toThrow(ShareLinkError);
	});

	it('refuses a path the rules refuse, as a `1.` link does', () => {
		for (const path of ['/etc/passwd', '../outside.ts', 'deploy/../../x.ts', 'a\\b.ts', 'deployments/playground/A.json']) {
			expect(() => decodeOverlay(encodeOverlay({[path]: 'x'}), base)).toThrow(ShareLinkError);
		}
	});

	it('refuses a `select` that names no file of the resulting project', () => {
		expect(() => decodeOverlay(encodeOverlay({'deploy/02.ts': ''}, 'deploy/03.ts'), base)).toThrow(
			new ShareLinkError('it selects "deploy/03.ts", which is not one of its files'),
		);
		for (const select of [1, null, 'toString', '']) {
			expect(() => decodeOverlay(raw({files: {}, select}), base)).toThrow(ShareLinkError);
		}
	});

	it('refuses content that is not files and a select', () => {
		for (const content of [[], 'text', {}, {files: []}, {files: {'a.ts': 1}}, {files: {}, extra: 1}]) {
			expect(() => decodeOverlay(raw(content), base)).toThrow(ShareLinkError);
		}
	});
});
