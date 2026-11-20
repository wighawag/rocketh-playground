<!--
	The Transactions view: the in-tab chain's transactions, newest first, decoded with the
	deployment records' ABIs. Each row follows the layout of jolly-roger's
	web/src/routes/explorer/components/TransactionItem.svelte (8a73e680): the hash and status, the
	method and its arguments, from and to, the block on the right. What differs: the rows come
	decoded from a store ($lib/playground/transactions/transaction-list.ts, which reads and decodes
	in plain .ts, where that component loads and decodes in its $effect), there is no link to an
	explorer page (the chain is in the tab), and a row also lists its events and a revert's reason,
	which jolly-roger shows on TransactionView.svelte. Loaded on demand by Playground.svelte.
-->
<script lang="ts">
	import * as Card from '$lib/shadcn/ui/card';
	import * as Empty from '$lib/shadcn/ui/empty';
	import {Button} from '$lib/core/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import XCircleIcon from '@lucide/svelte/icons/x-circle';
	import HashIcon from '@lucide/svelte/icons/hash';
	import {truncateHex, formatValue} from '$lib/core/utils/format';
	import {formatTimestamp} from '../../../routes/explorer/lib/utils';
	import {transactionListFor} from '$lib/playground/transactions/transaction-list';
	import {argsText, type Labelled} from '$lib/playground/transactions/decode';
	import type {PlaygroundSession} from '$lib/playground/session';

	let {session}: {session: PlaygroundSession} = $props();
	const list = $derived(transactionListFor(session));
</script>

{#snippet who(party: Labelled, testid: string)}
	<span class="inline-flex min-w-0 items-baseline gap-1" data-testid={testid} data-address={party.address} title={party.address}>
		{#if party.label}<span class="font-medium text-foreground">{party.label}</span>{/if}
		<span class="font-mono">{truncateHex(party.address)}</span>
	</span>
{/snippet}

<div class="h-full overflow-auto p-3" data-testid="transactions">
	<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Transactions</h2>
		<p class="text-xs text-muted-foreground">
			{#if $list.head !== undefined}The chain in this tab, at block {$list.head}, newest first.{/if}
		</p>
	</div>

	{#if $list.status === 'failed'}
		<p class="text-sm text-red-400" data-testid="transactions-error">The transactions could not be read: {$list.error}</p>
	{:else if $list.status === 'loading'}
		<p class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Reading the chain...</p>
	{:else if $list.rows.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon"><HashIcon /></Empty.Media>
				<Empty.Title>No transactions yet</Empty.Title>
				<Empty.Description>Deploy, or call a contract, and its transactions are listed here.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<ol class="space-y-3" data-testid="transaction-list">
			{#each $list.rows as row (row.hash)}
				<li>
					<Card.Root class="gap-0 py-0" data-testid="transaction" data-hash={row.hash} data-status={row.status} data-kind={row.kind}>
						<Card.Content class="space-y-2 p-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1 space-y-1">
									<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
										<span class="font-medium" data-testid="tx-title">{row.title}</span>
										<span class="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="tx-status">
											{#if row.status === 'success'}<CheckCircleIcon class="size-4 text-green-500" />Success{:else}<XCircleIcon
													class="size-4 text-red-500"
												/>Failed{/if}
										</span>
									</div>
									{#if row.args && row.args.length > 0}
										<div class="font-mono text-xs break-all text-muted-foreground" data-testid="tx-args">{argsText(row.args)}</div>
									{/if}
									{#if row.selector}
										<div class="font-mono text-xs text-muted-foreground">selector {row.selector}</div>
									{/if}
								</div>
								<div class="shrink-0 text-right">
									<div class="text-xs text-muted-foreground">Block</div>
									<div class="font-mono text-sm" data-testid="tx-block">{row.blockNumber}</div>
								</div>
							</div>

							<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<span class="inline-flex min-w-0 gap-1">From {@render who(row.from, 'tx-from')}</span>
								{#if row.to}
									<span class="inline-flex min-w-0 gap-1">To {@render who(row.to, 'tx-to')}</span>
								{:else if row.created}
									<span class="inline-flex min-w-0 gap-1">Created {@render who(row.created, 'tx-created')}</span>
								{/if}
								{#if row.value > 0n}<span>Value <span class="font-mono">{formatValue(row.value)}</span></span>{/if}
							</div>

							{#if row.events.length > 0 || row.undecodedEvents > 0}
								<ul class="space-y-0.5 border-l-2 pl-2 text-xs" data-testid="tx-events">
									{#each row.events as event, i (i)}
										<li class="font-mono break-all" data-testid="tx-event">
											<span class="text-foreground">{event.name}</span>{argsText(event.args)}
											{#if event.contract}<span class="text-muted-foreground"> from {event.contract}</span>{/if}
										</li>
									{/each}
									{#if row.undecodedEvents > 0}
										<li class="text-muted-foreground">
											{row.undecodedEvents} event{row.undecodedEvents === 1 ? '' : 's'} no deployment record decodes
										</li>
									{/if}
								</ul>
							{/if}

							{#if row.revert}
								<p class="text-xs break-words text-red-400" data-testid="tx-revert">Reverted: {row.revert}</p>
							{/if}

							<div class="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
								<span class="font-mono" data-testid="tx-hash" title={row.hash}>{truncateHex(row.hash, {start: 10, end: 8})}</span>
								<span>{formatTimestamp(row.timestamp)}</span>
							</div>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ol>
		{#if $list.hasOlder}
			<div class="mt-3 flex justify-center">
				<Button data-testid="older" variant="outline" onclick={() => list.older()} disabled={$list.loadingOlder}>
					{#if $list.loadingOlder}<Spinner />{/if}Show older (before block {$list.oldestBlock})
				</Button>
			</div>
		{/if}
	{/if}
</div>
