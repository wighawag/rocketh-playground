<script lang="ts">
	import {fileList} from '$lib/playground/format';
	import {contractsFromRecords} from '$lib/playground/contracts/records';
	import {truncateHex} from '$lib/core/utils/format';
	import type {PlaygroundState} from '$lib/playground/session';

	let {
		state,
		selectedContract,
		onselect,
		oncontract,
	}: {
		state: PlaygroundState;
		/** The contract the Contracts view shows, when it is the one shown. */
		selectedContract: string | undefined;
		onselect: (path: string) => void;
		oncontract: (name: string) => void;
	} = $props();
	const lists = $derived(fileList(state));
	const contracts = $derived(contractsFromRecords(state.records));
</script>

{#snippet entry(path: string)}
	<li>
		<button
			type="button"
			class="w-full truncate rounded px-2 py-0.5 text-left font-mono text-xs hover:bg-muted"
			class:bg-muted={selectedContract === undefined && state.selected === path}
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
<h2 class="mt-3 px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Contracts</h2>
<ul data-testid="contract-list">
	{#each contracts as contract (contract.name)}
		<li>
			<button
				type="button"
				class="flex w-full items-baseline justify-between gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-muted"
				class:bg-muted={selectedContract === contract.name}
				data-contract={contract.name}
				title={contract.address}
				onclick={() => oncontract(contract.name)}
			>
				<span class="truncate font-medium">{contract.name}</span>
				<span class="shrink-0 font-mono text-muted-foreground">{truncateHex(contract.address)}</span>
			</button>
		</li>
	{:else}
		<li class="px-2 text-xs text-muted-foreground">Deploy to read and call your contracts.</li>
	{/each}
</ul>
