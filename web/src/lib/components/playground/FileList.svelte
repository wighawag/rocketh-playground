<script lang="ts">
	import {fileList} from '$lib/playground/format';
	import {contractsFromRecords} from '$lib/playground/contracts/records';
	import {truncateHex} from '$lib/core/utils/format';
	import type {PlaygroundState} from '$lib/playground/session';

	let {
		state,
		selectedContract,
		transactionsShown,
		onselect,
		oncontract,
		ontransactions,
	}: {
		state: PlaygroundState;
		/** The contract the Contracts view shows, when it is the one shown. */
		selectedContract: string | undefined;
		/** Whether the Transactions view is the one shown. */
		transactionsShown: boolean;
		onselect: (path: string) => void;
		oncontract: (name: string) => void;
		ontransactions: () => void;
	} = $props();
	const lists = $derived(fileList(state));
	const contracts = $derived(contractsFromRecords(state.records));
</script>

{#snippet entry(path: string)}
	<li>
		<button
			type="button"
			class="w-full truncate rounded px-2 py-0.5 text-left font-mono text-xs hover:bg-muted"
			class:bg-muted={selectedContract === undefined && !transactionsShown && state.selected === path}
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
<h2 class="mt-3 px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Chain</h2>
<ul>
	<li>
		<button
			type="button"
			class="flex w-full items-baseline justify-between gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-muted"
			class:bg-muted={transactionsShown}
			data-testid="open-transactions"
			onclick={() => ontransactions()}
		>
			<span class="font-medium">Transactions</span>
			{#if state.blockNumber !== undefined}<span class="shrink-0 text-muted-foreground">block {state.blockNumber}</span>{/if}
		</button>
	</li>
</ul>
