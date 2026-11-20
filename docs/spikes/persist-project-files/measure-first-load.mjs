// The page's first load, raw and gzip: the static import closure of SvelteKit's entries, the
// root layout and the root page, read from the build's client manifest. Run from `web/` after
// `pnpm build`: `node ../docs/spikes/persist-project-files/measure-first-load.mjs`.
// `--files` lists each file of it. Measured for persist-project-files:
// before 829,964 B raw / 270,744 B gzip; after 834,086 B raw / 272,199 B gzip. Importing the
// store from `@rocketh/web`'s root instead measured 853,914 / 279,121: viem's code, kept for
// rocketh's top-level statements.
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';

const out = '.svelte-kit/output/client';
const manifest = JSON.parse(readFileSync(join(out, '.vite/manifest.json'), 'utf8'));
const roots = Object.keys(manifest).filter(
	(k) =>
		k.endsWith('client/entry.js') ||
		k.endsWith('client-optimized/app.js') ||
		k.endsWith('client-optimized/nodes/0.js') ||
		k.endsWith('client-optimized/nodes/2.js'),
);
const seen = new Set();
const files = new Set();
const walk = (key) => {
	if (seen.has(key)) return;
	seen.add(key);
	const chunk = manifest[key];
	files.add(chunk.file);
	for (const css of chunk.css ?? []) files.add(css);
	for (const i of chunk.imports ?? []) walk(i);
};
roots.forEach(walk);
let raw = 0;
let gzip = 0;
const verbose = process.argv.includes('--files');
for (const f of [...files].sort()) {
	const bytes = readFileSync(join(out, f));
	const zipped = gzipSync(bytes, {level: 9}).length;
	raw += bytes.length;
	gzip += zipped;
	if (verbose) console.log(`${f}\t${bytes.length}\t${zipped}`);
}
console.log(`first load: ${files.size} files, ${raw} B raw, ${gzip} B gzip`);
