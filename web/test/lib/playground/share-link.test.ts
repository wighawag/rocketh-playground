/**
 * The project in a link: what Share writes into the URL fragment and what opening a link reads
 * back, in node. The page reads the fragment as `key=value` pairs, so the project is the value of
 * one key, `project`.
 */
import {describe, it, expect} from 'vitest';
import {
	decodeProject,
	encodeProject,
	fragmentLength,
	SHARE_FRAGMENT_LIMIT,
	shareProject,
	ShareLinkError,
} from '../../../src/lib/playground/project/share-link.js';
import {startingProject} from '../../../src/lib/playground/project/template.js';
import {getHashParamsFromLocation} from '../../../src/lib/core/utils/web/url.js';

/** Text that hardly compresses: each character, of 90, costs about 6.5 bits deflated, and base64 4/3 of that. */
function incompressible(chars: number): string {
	let text = '';
	// xorshift32: no period short enough to let deflate find repeats
	let seed = 2463534242;
	while (text.length < chars) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		text += String.fromCharCode(33 + ((seed >>> 0) % 90));
	}
	return text;
}

describe('the project in a link', () => {
	it('round-trips the starting project, unicode and an empty file included', () => {
		const files = {...startingProject(), 'contracts/Notes.sol': '// é, ü, 你好, 🚀\n', 'deploy/empty.ts': ''};
		const value = encodeProject(files);
		expect(decodeProject(value)).toEqual(files);
	});

	it('is a value the fragment carries as it is: no character the URL or the key=value reading changes', () => {
		const value = encodeProject(startingProject());
		expect(value).toMatch(/^[A-Za-z0-9._-]+$/);
		expect(encodeURIComponent(value)).toBe(value);
		// as `web/src/lib/index.ts` reads the page's fragment
		(globalThis as {window?: unknown}).window = {};
		try {
			const params = getHashParamsFromLocation(`#debug=1&project=${value}`);
			expect(params.project).toBe(value);
		} finally {
			delete (globalThis as {window?: unknown}).window;
		}
	});

	it('gives the starting project a link well within the cap', () => {
		const shared = shareProject(startingProject());
		expect(shared.ok).toBe(true);
		if (!shared.ok) return;
		expect(fragmentLength(shared.value)).toBeLessThan(SHARE_FRAGMENT_LIMIT / 4);
		expect(decodeProject(shared.value)).toEqual(startingProject());
	});

	it('gives no link to a project whose encoded fragment is over 32 KB, and says how big it is', () => {
		expect(SHARE_FRAGMENT_LIMIT).toBe(32 * 1024);
		const big = {...startingProject(), 'contracts/Big.sol': `// ${incompressible(40_000)}\n`};
		const shared = shareProject(big);
		expect(shared.ok).toBe(false);
		if (shared.ok) return;
		expect(shared.length).toBeGreaterThan(SHARE_FRAGMENT_LIMIT);
		expect(shared.length).toBe(fragmentLength(encodeProject(big)));
	});

	it('measures the fragment as it is written, `project=` and the encoded value, right at the cap', () => {
		// find a size just under and one just over the cap
		let under: number | undefined;
		let over: number | undefined;
		for (let chars = 26_000; chars < 36_000 && over === undefined; chars += 50) {
			const length = fragmentLength(encodeProject({'contracts/A.sol': incompressible(chars)}));
			if (length <= SHARE_FRAGMENT_LIMIT) under = chars;
			else over = chars;
		}
		expect(under).toBeDefined();
		expect(over).toBeDefined();
		expect(shareProject({'contracts/A.sol': incompressible(under!)}).ok).toBe(true);
		expect(shareProject({'contracts/A.sol': incompressible(over!)}).ok).toBe(false);
	});

	it('refuses a corrupted, a truncated, an empty or a foreign value, with a reason', () => {
		const value = encodeProject(startingProject());
		const corrupted = value.slice(0, 40) + (value[40] === 'A' ? 'B' : 'A') + value.slice(41);
		for (const bad of [corrupted, value.slice(0, Math.floor(value.length / 2)), '', '1.', 'hello', '2.' + value.slice(2), '1.!!!']) {
			expect(() => decodeProject(bad)).toThrow(ShareLinkError);
		}
	});

	it('refuses a link whose content is not a set of project files', () => {
		const encode = (content: unknown) => encodeProject(content as never);
		for (const content of [[], {}, 'text', {'a.ts': 1}, {'/etc/passwd': 'x'}, {'../outside.ts': 'x'}, {'deploy/../../x.ts': 'x'}, {'a\\b.ts': 'x'}, {'deployments/playground/A.json': '{}'}]) {
			expect(() => decodeProject(encode(content))).toThrow(ShareLinkError);
		}
	});
});
