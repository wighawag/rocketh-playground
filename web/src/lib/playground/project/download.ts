/**
 * The header's Download: the reader's project saved as a hardhat-deploy project zip.
 *
 * The zip is built by `export-project.ts`, imported here on demand so that fflate is not part of
 * the page's first load.
 */
import {writable, type Readable} from 'svelte/store';
import type {Phase} from '../session';
import type {ProjectFiles} from './template';

/**
 * Whether Download has the reader's files to save: not before the session has opened them, and
 * not while Reset replaces them. A failed session still has them, so it can still download.
 */
export const canDownload = (phase: Phase) =>
	phase !== 'idle' && phase !== 'booting' && phase !== 'resetting';

export type SaveFile = (blob: Blob, name: string) => void;

/** The browser's save: a link to the blob, clicked. */
export const saveInBrowser: SaveFile = (blob, name) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.style.display = 'none';
	document.body.append(link);
	link.click();
	link.remove();
	// the download has started from the click; the URL can go once this task is done
	setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Builds the zip of `files` and saves it. */
export async function downloadProject(
	files: ProjectFiles,
	save: SaveFile = saveInBrowser,
): Promise<void> {
	const {zipProject, ZIP_NAME} = await import('./export-project');
	const zip = zipProject(files);
	save(new Blob([zip as BlobPart], {type: 'application/zip'}), ZIP_NAME);
}

export type DownloadState = {
	status: 'idle' | 'building' | 'failed';
	error?: string;
};

export type ProjectDownload = Readable<DownloadState> & {
	/** Saves `files` as the project zip; a second press while one is built does nothing. */
	download(files: ProjectFiles): Promise<void>;
};

/** The Download button's state: building while the zip module loads and runs, why it failed. */
export function createProjectDownload(
	save: SaveFile = saveInBrowser,
): ProjectDownload {
	const store = writable<DownloadState>({status: 'idle'});
	let building = false;
	async function download(files: ProjectFiles) {
		if (building) return;
		building = true;
		store.set({status: 'building'});
		try {
			await downloadProject(files, save);
			store.set({status: 'idle'});
		} catch (error) {
			store.set({
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			building = false;
		}
	}
	return {subscribe: store.subscribe, download};
}
