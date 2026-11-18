// Copies the pinned soljson into the build (public/solc/), once, and refuses a file whose sha256
// is not the one binaries.soliditylang.org's list.json gives for that release.
//
// The release is looked up through `releases[version]`, never by scanning `builds` for the
// version: `builds` also lists nightlies under the same `version` ("0.8.28" with prerelease
// "nightly.2024.9.4"), and the first match there is a nightly, not the release.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const VERSION = '0.8.28';
const HOST = 'https://binaries.soliditylang.org/bin';
const OUT = new URL('../public/solc/', import.meta.url);

const list = await (await fetch(`${HOST}/list.json`)).json();
const path = list.releases[VERSION];
const build = list.builds.find((b) => b.path === path);
if (!path || !build) throw new Error(`solc ${VERSION} is not a release in ${HOST}/list.json`);
const expected = build.sha256.replace(/^0x/, '');

mkdirSync(OUT, {recursive: true});
const file = new URL(path, OUT);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (existsSync(file) && sha256(readFileSync(file)) === expected) {
	console.log(`solc ${VERSION}: ${path} already present, sha256 ${expected}`);
} else {
	const response = await fetch(`${HOST}/${path}`);
	if (!response.ok) throw new Error(`fetching ${path}: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const actual = sha256(bytes);
	if (actual !== expected) throw new Error(`${path}: sha256 ${actual}, list.json says ${expected}`);
	writeFileSync(file, bytes);
	console.log(`solc ${VERSION}: ${path} (${bytes.length} bytes), sha256 ${actual} matches list.json`);
}
// What the page loads: the file name, so the worker never guesses it.
writeFileSync(
	new URL('../src/solc-version.json', import.meta.url),
	JSON.stringify({version: VERSION, path: `solc/${path}`, sha256: expected}, null, '\t') + '\n',
);
