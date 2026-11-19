<script lang="ts">
	import {fileList} from '$lib/playground/format';
	import type {PlaygroundState} from '$lib/playground/session';

	let {state, onselect}: {state: PlaygroundState; onselect: (path: string) => void} = $props();
	const lists = $derived(fileList(state));
</script>

{#snippet entry(path: string)}
	<li>
		<button
			type="button"
			class="w-full truncate rounded px-2 py-0.5 text-left font-mono text-xs hover:bg-muted"
			class:bg-muted={state.selected === path}
			data-path={path}
			onclick={() => onselect(path)}>{path}</button
		>
	</li>
{/snippet}

<h2 class="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Project</h2>
<ul data-testid="project-files">
	{#each lists.project as path (path)}{@render entry(path)}{/each}
</ul>
<h2 class="mt-3 px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Deployments</h2>
<ul data-testid="record-files">
	{#each lists.records as path (path)}{@render entry(path)}{:else}
		<li class="px-2 text-xs text-muted-foreground">None yet: press Deploy.</li>
	{/each}
</ul>
