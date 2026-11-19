import {describe, it, expect} from 'vitest';
import {compilerLabel, formatBytes, lastRunLabel} from '../../../src/lib/playground/format.js';

describe('what the page says', () => {
	it('shows the compiler size while it loads', () => {
		expect(compilerLabel({status: 'loading', loaded: 3_000_000, total: 9_169_169}, '0.8.28')).toBe(
			'Loading the Solidity compiler (solc 0.8.28): 3.0 MB of 9.2 MB',
		);
		expect(compilerLabel({status: 'loading', loaded: 9_169_169, total: 9_169_169}, '0.8.28')).toBe('Starting the Solidity compiler (solc 0.8.28)');
		expect(compilerLabel({status: 'ready', loaded: 9_169_169, total: 9_169_169}, '0.8.28')).toBe('solc 0.8.28');
		expect(formatBytes(512)).toBe('512 B');
	});

	it('says when a run sent nothing', () => {
		expect(lastRunLabel({outcome: 'deployed', stage: 'run', sent: 0, ms: 1})).toBe('Up to date: nothing sent');
		expect(lastRunLabel({outcome: 'deployed', stage: 'run', sent: 2, ms: 1})).toBe('2 transactions sent');
		expect(lastRunLabel({outcome: 'failed', stage: 'compile', sent: 0, ms: 1})).toBe('Nothing was sent');
		expect(lastRunLabel({outcome: 'stopped', stage: 'run', sent: 0, ms: 1})).toBe('Stopped');
	});
});
