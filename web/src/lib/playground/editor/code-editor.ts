/**
 * The code editor: CodeMirror 6 on the page's thread, which is presentation only. It types and
 * checks nothing itself: diagnostics, completion and hover come from the language service in the
 * TypeScript worker (`../typescript/language-service.ts`), through `@valtown/codemirror-ts`.
 *
 * - **The session holds the text.** Every edit goes to `onEdit` (the session's `edit`), and
 *   `show` is given the text back from the session; a file's text survives switching away from it
 *   because it lives there, not in the editor.
 * - **Usable at once, typed later.** Until the session passes a language service, a `.ts` file
 *   gets TypeScript syntax only; when it does, the view is rebuilt with the language service's
 *   extensions, keeping the selection, the scroll position and the focus.
 * - **Rebuilt rather than reconfigured.** A view is rebuilt when the file, the language service or
 *   the artifact types change (`revision`), because the linter re-runs on a new view and not when
 *   the worker's types change under it. What that costs is the undo history at those moments.
 *
 * `.sol` files get `@replit/codemirror-lang-solidity`; anything else is plain text. On a narrow
 * screen (a phone) long lines wrap rather than scroll sideways.
 */
import {basicSetup, EditorView} from 'codemirror';
import {javascript, typescriptLanguage} from '@codemirror/lang-javascript';
import {solidity} from '@replit/codemirror-lang-solidity';
import {tsAutocompleteWorker, tsFacetWorker, tsHoverWorker, tsLinterWorker} from '@valtown/codemirror-ts';
import {isTyped, vfsPath} from '../typescript/language-service-paths.js';

/** What the editor's extensions call in the TypeScript worker (`@valtown/codemirror-ts`'s `WorkerShape`, less `getEnv`). */
export type EditorLanguageService = {
	updateFile(args: {path: string; code: string}): unknown;
	getLints(args: {path: string; diagnosticCodesToIgnore: number[]}): unknown;
	getAutocompletion(args: {path: string; context: {pos: number; explicit: boolean}}): unknown;
	getHover(args: {path: string; pos: number}): unknown;
};

export type EditorDocument = {
	path: string;
	text: string;
	/** The TypeScript worker, once its language service is ready. */
	languageService?: EditorLanguageService;
	/** Changes when the language service's artifact types do (the session's `artifactTypes`). */
	revision?: number;
};

export type CodeEditor = {
	show(document: EditorDocument): void;
	destroy(): void;
};

/** Timings the e2e suite and the PR's measurements read: `performance.getEntriesByName(...)`. */
export const MARKS = {usable: 'playground:editor-usable', attached: 'playground:language-service-attached'} as const;

function language(path: string, typed: boolean) {
	if (path.endsWith('.sol')) return solidity;
	if (/\.[cm]?[jt]s$/.test(path)) {
		// With the language service attached, its completion replaces `javascript()`'s local one,
		// which would list every name twice.
		return typed ? typescriptLanguage : javascript({typescript: !/\.[cm]?js$/.test(path)});
	}
	return [];
}

/**
 * The editor's chrome in the site's theme tokens (`src/app.css`), so it follows light and dark.
 * The SYNTAX colors are CodeMirror's default highlight style, made for a light background; on the
 * dark theme `CodeEditor.svelte` inverts them (a dark highlight style would need
 * `@codemirror/language`'s `HighlightStyle`, which is not a dependency).
 */
const theme = EditorView.theme({
	'&': {height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)'},
	'.cm-scroller': {overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'},
	'.cm-gutters': {backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)'},
	'.cm-activeLine': {backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)'},
	'.cm-activeLineGutter': {backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)'},
	'.cm-cursor, .cm-dropCursor': {borderLeftColor: 'var(--foreground)'},
	'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
		backgroundColor: 'color-mix(in oklab, var(--ring) 45%, transparent)',
	},
	'.cm-tooltip': {backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)'},
	'.cm-tooltip-autocomplete ul li[aria-selected]': {backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)'},
	'.cm-tooltip-hover': {maxWidth: 'min(40rem, 90vw)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '0.25rem 0.5rem'},
	'.cm-diagnostic': {whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 'min(40rem, 90vw)'},
	'.cm-panels': {backgroundColor: 'var(--muted)', color: 'var(--foreground)'},
	'.cm-foldPlaceholder': {backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none'},
});

export function createCodeEditor(parent: HTMLElement, onEdit: (path: string, text: string) => void): CodeEditor {
	let view: EditorView | undefined;
	let key: string | undefined;
	let path = '';
	/** Set while `show` writes the session's text in, so it is not echoed back as an edit. */
	let replacing = false;

	function build(document: EditorDocument, typed: boolean) {
		const previous = view && document.path === path ? view : undefined;
		const keep = previous && {
			anchor: Math.min(previous.state.selection.main.anchor, document.text.length),
			head: Math.min(previous.state.selection.main.head, document.text.length),
			scrollTop: previous.scrollDOM.scrollTop,
			focused: previous.hasFocus,
		};
		view?.destroy();
		path = document.path;
		const service = typed ? document.languageService : undefined;
		view = new EditorView({
			doc: document.text,
			selection: keep ? {anchor: keep.anchor, head: keep.head} : undefined,
			parent,
			extensions: [
				basicSetup,
				theme,
				narrow() ? EditorView.lineWrapping : [],
				language(document.path, typed),
				EditorView.contentAttributes.of({'aria-label': document.path, autocapitalize: 'off', autocorrect: 'off'}),
				EditorView.editorAttributes.of({'data-language-service': service ? 'attached' : 'syntax'}),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !replacing) onEdit(document.path, update.state.doc.toString());
				}),
				service
					? [
							tsFacetWorker.of({worker: service as never, path: vfsPath(document.path)}),
							tsLinterWorker(),
							typescriptLanguage.data.of({autocomplete: tsAutocompleteWorker()}),
							tsHoverWorker(),
						]
					: [],
			],
		});
		if (keep) {
			view.scrollDOM.scrollTop = keep.scrollTop;
			if (keep.focused) view.focus();
		}
		mark(MARKS.usable);
		if (service) mark(MARKS.attached);
	}

	return {
		show(document) {
			const typed = isTyped(document.path) && document.languageService !== undefined;
			const next = `${document.path}\n${typed ? `typed ${document.revision ?? 0}` : 'syntax'}`;
			if (next !== key || !view) {
				key = next;
				build(document, typed);
				return;
			}
			// The same file: only a change made elsewhere (not by typing here) needs writing in.
			const current = view.state.doc.toString();
			if (current === document.text) return;
			replacing = true;
			try {
				view.dispatch({changes: {from: 0, to: current.length, insert: document.text}});
			} finally {
				replacing = false;
			}
		},
		destroy() {
			view?.destroy();
			view = undefined;
			key = undefined;
		},
	};
}

/** Tailwind's `md` breakpoint, below which the page is one column. */
const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches;

/** The first time only: these are "how long until", not "how often". */
function mark(name: string) {
	if (typeof performance === 'undefined' || performance.getEntriesByName(name).length > 0) return;
	performance.mark(name);
}
