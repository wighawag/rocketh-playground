/**
 * The page's side of a shared link, with a stand-in session: Share (the link, or the zip when the
 * project is too big) and opening a link (at once over the starting project, after a confirmation
 * over the reader's own, never with a corrupted one), and the fragment's `project` key removed
 * once the link has been dealt with.
 */
import {describe, it, expect} from 'vitest';
import {get, writable} from 'svelte/store';
import {createProjectShare} from '../../../src/lib/playground/project/share.js';
import {createLinkOpener, type OpenableSession} from '../../../src/lib/playground/project/open-link.js';
import {withoutFragmentKey} from '../../../src/lib/playground/project/link-fragment.js';
import {tooBigLabel} from '../../../src/lib/playground/project/share.js';
import {encodeProject, decodeProject, SHARE_FRAGMENT_LIMIT} from '../../../src/lib/playground/project/share-link.js';
import {encodeOverlay} from '../../../src/lib/playground/project/overlay-link.js';
import {startingProject} from '../../../src/lib/playground/project/template.js';
import type {Phase} from '../../../src/lib/playground/session.js';
import type {ProjectFiles} from '../../../src/lib/playground/project/template.js';

const PAGE = 'https://play.rocketh.dev/?debug=1#debug=1';

describe('Share', () => {
	it('copies a link to the page holding the project, which decodes to the same files', async () => {
		const copied: string[] = [];
		const share = createProjectShare({href: () => PAGE, copy: async (text) => (copied.push(text), true)});
		const files = {...startingProject(), 'deploy/02.ts': '// mine\n'};
		await share.share(files);
		const state = get(share);
		expect(state.status).toBe('shared');
		if (state.status !== 'shared') return;
		expect(state.copied).toBe(true);
		expect(copied).toEqual([state.link]);
		const url = new URL(state.link);
		expect(url.origin + url.pathname + url.search).toBe('https://play.rocketh.dev/?debug=1');
		expect(url.hash.startsWith('#project=')).toBe(true);
		expect(decodeProject(url.hash.slice('#project='.length))).toEqual(files);
	});

	it('still shows the link when the clipboard refuses it', async () => {
		const share = createProjectShare({href: () => PAGE, copy: async () => false});
		await share.share(startingProject());
		expect(get(share)).toMatchObject({status: 'shared', copied: false});
	});

	it('gives no link to a project over the cap, and says how big its fragment would be', async () => {
		const copied: string[] = [];
		const share = createProjectShare({href: () => PAGE, copy: async (text) => (copied.push(text), true)});
		let noise = '';
		for (let i = 0; noise.length < 60_000; i++) noise += Math.sin(i).toString(36).slice(2);
		await share.share({...startingProject(), 'contracts/Big.sol': noise});
		const state = get(share);
		expect(state.status).toBe('too-big');
		if (state.status !== 'too-big') return;
		expect(state.length).toBeGreaterThan(SHARE_FRAGMENT_LIMIT);
		expect(copied).toEqual([]);
		share.close();
		expect(get(share)).toEqual({status: 'idle'});
	});

	it('says how big a link would be against the cap, and offers the zip', () => {
		expect(tooBigLabel(40_000)).toBe(
			'This project is too big for a link: its link would carry 39.1 KB, and a link carries at most 32 KB. Download it instead.',
		);
	});
});

describe('the fragment without the project', () => {
	it('drops the `project` key and keeps the others as they were', () => {
		expect(withoutFragmentKey('https://x.dev/a/?q=1#debug=1&project=1.abc&x=a%20b', 'project')).toBe('https://x.dev/a/?q=1#debug=1&x=a%20b');
		expect(withoutFragmentKey('https://x.dev/#project=1.abc', 'project')).toBe('https://x.dev/');
		expect(withoutFragmentKey('https://x.dev/#a=1', 'project')).toBe('https://x.dev/#a=1');
	});
});

/** A session that only knows its phase and its files, and records what it is asked to open. */
function fakeSession(files: ProjectFiles, phase: Phase = 'booting') {
	const store = writable({phase, files});
	const opened: ProjectFiles[] = [];
	const selected: (string | undefined)[] = [];
	const session: OpenableSession & {become(phase: Phase): void; opened: ProjectFiles[]; selected: (string | undefined)[]} = {
		subscribe: store.subscribe,
		async open(next, select) {
			if (get(store).phase !== 'ready') return;
			opened.push(next);
			selected.push(select);
			store.set({phase: 'ready', files: next});
		},
		become: (next) => store.update((s) => ({...s, phase: next})),
		opened,
		selected,
	};
	return session;
}

function opener(session: OpenableSession, value: string | undefined) {
	const removed: number[] = [];
	const link = createLinkOpener({session, value, removeFromURL: () => removed.push(1)});
	return {link, removed};
}

const linked = {...startingProject(), 'deploy/01_deploy_counter.ts': '// from a link\n'};

describe('opening a link', () => {
	it('does nothing without one', async () => {
		const session = fakeSession(startingProject(), 'ready');
		const {link, removed} = opener(session, undefined);
		await link.begin();
		expect(get(link)).toEqual({status: 'none'});
		expect(session.opened).toEqual([]);
		expect(removed).toEqual([]);
	});

	it('opens at once over the starting project, once the session is ready, then drops the key', async () => {
		const session = fakeSession(startingProject());
		const {link, removed} = opener(session, encodeProject(linked));
		const begun = link.begin();
		await new Promise((r) => setTimeout(r, 10));
		expect(session.opened).toEqual([]);
		session.become('ready');
		await begun;
		expect(session.opened).toEqual([linked]);
		expect(get(link)).toEqual({status: 'none'});
		expect(removed).toEqual([1]);
	});

	it("asks over the reader's own project: Cancel opens nothing and drops the key", async () => {
		const mine = {...startingProject(), 'deploy/02.ts': '// mine\n'};
		const session = fakeSession(mine, 'ready');
		const {link, removed} = opener(session, encodeProject(linked));
		await link.begin();
		expect(get(link)).toEqual({status: 'confirm'});
		expect(removed).toEqual([]);
		link.cancel();
		expect(get(link)).toEqual({status: 'none'});
		expect(session.opened).toEqual([]);
		expect(get(session).files).toEqual(mine);
		expect(removed).toEqual([1]);
		// a second answer changes nothing
		await link.confirm();
		expect(session.opened).toEqual([]);
	});

	it("asks over the reader's own project: Open opens the link's files and drops the key", async () => {
		const session = fakeSession({...startingProject(), 'deploy/02.ts': '// mine\n'}, 'ready');
		const {link, removed} = opener(session, encodeProject(linked));
		await link.begin();
		expect(get(link)).toEqual({status: 'confirm'});
		await link.confirm();
		expect(session.opened).toEqual([linked]);
		expect(get(link)).toEqual({status: 'none'});
		expect(removed).toEqual([1]);
	});

	it('reports a corrupted link, opens nothing and drops the key', async () => {
		const session = fakeSession({...startingProject()}, 'ready');
		const value = encodeProject(linked);
		const {link, removed} = opener(session, value.slice(0, value.length - 20));
		await link.begin();
		expect(get(link)).toEqual({status: 'invalid', error: 'it is corrupted or cut short'});
		expect(session.opened).toEqual([]);
		expect(removed).toEqual([1]);
		link.dismiss();
		expect(get(link)).toEqual({status: 'none'});
	});

	it('opens a `2.` link as the starting project with its files over it, its file selected, then drops the key', async () => {
		const session = fakeSession(startingProject());
		const files = {'contracts/Greeter.sol': '// greeter\n', 'deploy/01_deploy_counter.ts': '// replaced\n'};
		const {link, removed} = opener(session, encodeOverlay(files, 'contracts/Greeter.sol'));
		const begun = link.begin();
		session.become('ready');
		await begun;
		expect(session.opened).toEqual([{...startingProject(), ...files}]);
		expect(session.selected).toEqual(['contracts/Greeter.sol']);
		expect(get(link)).toEqual({status: 'none'});
		expect(removed).toEqual([1]);
	});

	it("asks before a `2.` link replaces the reader's own project, as a `1.` link does", async () => {
		const session = fakeSession({...startingProject(), 'deploy/02.ts': '// mine\n'}, 'ready');
		const {link} = opener(session, encodeOverlay({'deploy/03.ts': '// linked\n'}));
		await link.begin();
		expect(get(link)).toEqual({status: 'confirm'});
		await link.confirm();
		expect(session.opened).toEqual([{...startingProject(), 'deploy/03.ts': '// linked\n'}]);
		expect(session.selected).toEqual([undefined]);
	});

	it('reports a `2.` link selecting a file it does not hold, and opens nothing', async () => {
		const session = fakeSession(startingProject(), 'ready');
		const {link, removed} = opener(session, encodeOverlay({'deploy/03.ts': ''}, 'deploy/04.ts'));
		await link.begin();
		expect(get(link)).toEqual({status: 'invalid', error: 'it selects "deploy/04.ts", which is not one of its files'});
		expect(session.opened).toEqual([]);
		expect(removed).toEqual([1]);
	});

	it('keeps the key when the playground did not start, so a reload can open it', async () => {
		const session = fakeSession(startingProject());
		const {link, removed} = opener(session, encodeProject(linked));
		const begun = link.begin();
		session.become('failed');
		await begun;
		expect(get(link)).toMatchObject({status: 'failed'});
		expect(session.opened).toEqual([]);
		expect(removed).toEqual([]);
	});
});
