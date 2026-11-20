/**
 * The reader's project as it is saved between visits: the files, in `@rocketh/web`'s persistent
 * VFS over IndexedDB (as the spec's Persistence decision names it), and which file is selected,
 * beside them in the same database.
 *
 * Both live in one object store of their own database, under two keys: two adapters on one
 * database must share a store, since only the first to open it (at version 1) creates stores.
 *
 * Imported from the published package's `dist/persistence.js` (which imports only its `vfs.js`),
 * not from `@rocketh/web`: the page imports this, and the package's root also exports
 * `setupEnvironment`, which brings rocketh, whose modules have top-level code (and through it
 * viem) the bundler keeps even when nothing of rocketh is used. rocketh runs in the runner
 * worker only. The package's `exports` has no subpath for it, hence the path.
 */
import {
	createIndexedDBPersistence,
	createPersistentVFS,
	type PersistentVFS,
} from '../../../../node_modules/@rocketh/web/dist/persistence.js';
import type {ProjectFiles} from './template.js';

const STORE = 'project';

export type SavedProject = {
	/** What was saved, or `initial` when the database held nothing yet. */
	files: ProjectFiles;
	/** The file selected when the project was last saved, if any was. */
	selected?: string;
	write(path: string, text: string): void;
	select(path: string): void;
	/** Resolves once every change made so far has reached storage. */
	flush(): Promise<void>;
	/** Stop writing through; the database keeps what it has. */
	dispose(): void;
};

export async function openSavedProject(db: string, initial: ProjectFiles): Promise<SavedProject> {
	const selection = createIndexedDBPersistence({db, store: STORE, key: 'selected'});
	const [vfs, saved]: [PersistentVFS, Record<string, string> | null] = await Promise.all([
		createPersistentVFS({persistence: createIndexedDBPersistence({db, store: STORE, key: 'files'}), initial}),
		selection.load(),
	]);
	// Saves run one after the other, so the last selection is the one kept.
	let selecting: Promise<void> = Promise.resolve();
	let disposed = false;
	return {
		files: vfs.snapshot(),
		selected: saved?.path,
		write: (path, text) => vfs.write(path, text),
		select(path) {
			if (disposed) return;
			selecting = selecting.then(() =>
				selection.save({path}).catch((error) => console.error('failed to save the selected file', error)),
			);
		},
		async flush() {
			await Promise.all([vfs.flush(), selecting]);
		},
		dispose() {
			disposed = true;
			vfs.dispose();
		},
	};
}
