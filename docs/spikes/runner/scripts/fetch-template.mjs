// Extracts the files the spike runs from the PUBLISHED hardhat-deploy tarball's templates/basic,
// so they are what `hardhat-deploy init` writes, not a copy of a checkout. The tarball's
// integrity is checked against the registry's before anything is read from it.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';

const VERSION = '2.4.0';
const FILES = ['contracts/Counter.sol', 'deploy/01_deploy_counter.ts', 'rocketh/config.ts', 'rocketh/deploy.ts'];
const OUT = new URL('../template/', import.meta.url).pathname;

const meta = await (await fetch(`https://registry.npmjs.org/hardhat-deploy/${VERSION}`)).json();
const tarball = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
const [algo, digest] = meta.dist.integrity.split('-');
const actual = createHash(algo).update(tarball).digest('base64');
if (actual !== digest) throw new Error(`hardhat-deploy@${VERSION}: integrity ${actual}, registry says ${digest}`);

const work = mkdtempSync(join(tmpdir(), 'hardhat-deploy-'));
try {
	execFileSync('tar', ['xzf', '-', '-C', work], {input: tarball});
	for (const file of FILES) {
		mkdirSync(dirname(join(OUT, file)), {recursive: true});
		copyFileSync(join(work, 'package/templates/basic', file), join(OUT, file));
	}
	console.log(`hardhat-deploy@${VERSION} (${meta.dist.integrity}): ${FILES.join(', ')}`);
} finally {
	rmSync(work, {recursive: true, force: true});
}
