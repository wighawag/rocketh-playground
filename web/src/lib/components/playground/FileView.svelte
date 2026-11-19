<script lang="ts">
	import {isRecord, selectedText} from '$lib/playground/format';
	import type {PlaygroundState} from '$lib/playground/session';

	let {state, onedit}: {state: PlaygroundState; onedit: (path: string, text: string) => void} = $props();
</script>

<div class="flex h-full flex-col">
	<div class="border-b px-3 py-1 font-mono text-xs text-muted-foreground">
		{state.selected}{#if isRecord(state, state.selected)} (written by rocketh, read-only){/if}
	</div>
	{#if isRecord(state, state.selected)}
		<pre data-testid="record" class="flex-1 overflow-auto p-3 font-mono text-xs">{selectedText(state)}</pre>
	{:else}
		<textarea
			data-testid="editor"
			class="flex-1 resize-none bg-transparent p-3 font-mono text-xs outline-none"
			spellcheck="false"
			value={selectedText(state)}
			oninput={(event) => onedit(state.selected, event.currentTarget.value)}
		></textarea>
	{/if}
</div>
