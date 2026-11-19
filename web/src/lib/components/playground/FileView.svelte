<script lang="ts">
	import {isRecord, selectedText} from '$lib/playground/format';
	import type {PlaygroundSession, PlaygroundState} from '$lib/playground/session';
	import CodeEditor from './CodeEditor.svelte';

	let {state, session, onedit}: {state: PlaygroundState; session: PlaygroundSession; onedit: (path: string, text: string) => void} =
		$props();
</script>

<div class="flex h-full flex-col">
	<div class="border-b px-3 py-1 font-mono text-xs text-muted-foreground">
		{state.selected}{#if isRecord(state, state.selected)} (written by rocketh, read-only){/if}
		<span
			data-testid="language-service"
			data-status={state.languageService.status}
			data-ready-ms={state.languageService.readyMs?.toFixed(0)}
			data-load-ms={state.languageService.loadMs?.toFixed(0)}
			data-create-ms={state.languageService.createMs?.toFixed(0)}
			title={state.languageService.error}
			class="float-right"
		>
			{#if state.languageService.status === 'loading'}loading types...{:else if state.languageService.status === 'failed'}types unavailable{/if}
		</span>
	</div>
	{#if isRecord(state, state.selected)}
		<pre data-testid="record" class="flex-1 overflow-auto p-3 font-mono text-xs">{selectedText(state)}</pre>
	{:else}
		<div class="min-h-0 flex-1">
			<CodeEditor
				path={state.selected}
				text={selectedText(state)}
				languageService={state.languageService.status === 'ready' ? session.languageService() : undefined}
				revision={state.artifactTypes}
				{onedit}
			/>
		</div>
	{/if}
</div>
