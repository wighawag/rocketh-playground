// Refreshes web/project-template/ from the PUBLISHED hardhat-deploy tarball's templates/basic,
// which is what `hardhat-deploy init` writes. Never from a checkout: the playground teaches what a
// user can install.
//
//   node scripts/update-project-template.mjs [version]   (default: the version already recorded)
//
// The tarball's integrity is checked against the registry's before anything is read from it, and
// the version and integrity are recorded in project-template.json beside the folder.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const web = new URL('..', import.meta.url).pathname;
const recordPath = join(web, 'project-template.json');
const recorded = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : undefined;
const version = process.argv[2] ?? recorded?.version;
if (!version) throw new Error('usage: node scripts/update-project-template.mjs <hardhat-deploy version>');

const meta = await (await fetch(`https://registry.npmjs.org/hardhat-deploy/${version}`)).json();
if (!meta.dist) throw new Error(`hardhat-deploy@${version} is not on npm`);
const tarball = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
const [algorithm, digest] = meta.dist.integrity.split('-');
const actual = createHash(algorithm).update(tarball).digest('base64');
if (actual !== digest) throw new Error(`hardhat-deploy@${version}: integrity ${actual}, the registry says ${digest}`);

const work = mkdtempSync(join(tmpdir(), 'hardhat-deploy-'));
try {
	execFileSync('tar', ['xzf', '-', '-C', work], {input: tarball});
	const out = join(web, 'project-template');
	rmSync(out, {recursive: true, force: true});
	cpSync(join(work, 'package/templates/basic'), out, {recursive: true});
} finally {
	rmSync(work, {recursive: true, force: true});
}
writeFileSync(recordPath, JSON.stringify({package: 'hardhat-deploy', version, integrity: meta.dist.integrity}, null, '\t') + '\n');
console.log(`project-template/ is hardhat-deploy@${version} templates/basic (${meta.dist.integrity})`);
