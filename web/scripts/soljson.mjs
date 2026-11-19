// The ONE solc the playground ships, copied into the build (static/solc/), never fetched from a
// third-party host at run time. `ensureSoljson()` is called by the vite plugin before a build or
// a dev server starts, and by the tests that compile; run directly it does the same:
//
//   node scripts/soljson.mjs
//
// The version is pinned in solc.json. The file is fetched once from binaries.soliditylang.org and
// refused unless its sha256 matches BOTH solc.json and that host's list.json. The release is
// looked up through `releases[version]`: `builds` also lists nightlies under the same `version`
// ("0.8.28" with prerelease "nightly.2024.9.4"), so a search by version finds the wrong file.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const HOST = 'https://binaries.soliditylang.org/bin';
const web = new URL('..', import.meta.url);
export const pinned = JSON.parse(readFileSync(new URL('solc.json', web), 'utf8'));
export const soljsonPath = fileURLToPath(new URL(`static/solc/${pinned.path}`, web));

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function ensureSoljson({log = console.log} = {}) {
	if (existsSync(soljsonPath) && sha256(readFileSync(soljsonPath)) === pinned.sha256) return soljsonPath;
	const list = await (await fetch(`${HOST}/list.json`)).json();
	const path = list.releases?.[pinned.version];
	const build = list.builds?.find((b) => b.path === path);
	if (path !== pinned.path || !build) {
		throw new Error(`solc ${pinned.version}: list.json names ${path}, solc.json pins ${pinned.path}`);
	}
	const listed = build.sha256.replace(/^0x/, '');
	if (listed !== pinned.sha256) throw new Error(`solc ${pinned.version}: list.json sha256 ${listed}, solc.json pins ${pinned.sha256}`);
	const response = await fetch(`${HOST}/${path}`);
	if (!response.ok) throw new Error(`fetching ${HOST}/${path}: HTTP ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const actual = sha256(bytes);
	if (actual !== pinned.sha256) throw new Error(`${path}: sha256 ${actual}, expected ${pinned.sha256}`);
	// `bytes` is what the page shows while the compiler loads; a stale value would mislead it.
	if (bytes.length !== pinned.bytes) throw new Error(`${path}: ${bytes.length} bytes, solc.json says ${pinned.bytes}`);
	mkdirSync(new URL('static/solc/', web), {recursive: true});
	writeFileSync(soljsonPath, bytes);
	log(`solc ${pinned.version}: fetched ${path} (${bytes.length} bytes), sha256 matches list.json`);
	return soljsonPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await ensureSoljson();
}
