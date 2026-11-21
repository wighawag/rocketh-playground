<script lang="ts">
	import {
		createCodeEditor,
		type CodeEditor,
		type EditorLanguageService,
	} from '$lib/playground/editor/code-editor';

	let {
		path,
		text,
		languageService,
		revision,
		onedit,
	}: {
		path: string;
		text: string;
		languageService?: EditorLanguageService;
		revision: number;
		onedit: (path: string, text: string) => void;
	} = $props();

	let host: HTMLDivElement;
	let editor: CodeEditor | undefined = $state();

	$effect(() => {
		const created = createCodeEditor(host, (p, t) => onedit(p, t));
		editor = created;
		return () => created.destroy();
	});

	$effect(() => {
		editor?.show({path, text, languageService, revision});
	});
</script>

<!-- 16px on a phone: a smaller font makes iOS zoom the page when the editor is focused. -->
<div
	bind:this={host}
	data-testid="editor"
	class="h-full min-h-0 text-base md:text-xs"
></div>

<style>
	/*
	 * CodeMirror's default highlight style is made for a light background. On the dark theme the
	 * text layer is inverted and its hues turned back, which keeps each color's hue and makes it
	 * light; the base text is set to the inverse of the foreground first. Only `.cm-content`: the
	 * gutters, selection, cursor and tooltips are styled from the theme tokens.
	 */
	:global(.dark) div :global(.cm-content) {
		color: oklch(0.15 0 0);
		filter: invert(1) hue-rotate(180deg);
	}
	/* inside the inverted layer: black at 8% shows as a faint light bar */
	:global(.dark) div :global(.cm-activeLine) {
		background-color: rgb(0 0 0 / 0.08);
	}
</style>
