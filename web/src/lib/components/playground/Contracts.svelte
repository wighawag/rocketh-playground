<!--
	The Contracts view: one deployed contract, its read and write functions, and who a write is
	sent from. The layout is jolly-roger's web/src/routes/contracts/+page.svelte (8a73e680): the
	contract's name and address, then Read and Write tabs with a card per function. The contract
	is picked in the file list rather than with that page's select, and the list comes from the
	deployment records ($lib/playground/contracts/records.ts), not from a generated deployments
	file. The address is jolly-roger's $lib/core/ui/ethereum/Address.svelte, in full, with its copy
	button. Loaded on demand by Playground.svelte, with viem's ABI and signing code.
-->
<script lang="ts">
	import * as Tabs from '$lib/shadcn/ui/tabs';
	import * as Empty from '$lib/shadcn/ui/empty';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import ContractFunction from '../../../routes/contracts/components/ContractFunction.svelte';
	import {getFunctionSignature} from '../../../routes/contracts/lib/utils';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import {truncateHex} from '$lib/core/utils/format';
	import {contractsFromRecords} from '$lib/playground/contracts/records';
	import {signingAccounts} from '$lib/playground/contracts/accounts';
	import type {PlaygroundSession} from '$lib/playground/session';

	let {session, name}: {session: PlaygroundSession; name: string} = $props();

	const contract = $derived(contractsFromRecords($session.records).find((c) => c.name === name));
	const accounts = $derived(signingAccounts($session.namedAccounts));
	let fromIndex = $state<number | undefined>();
	const from = $derived(accounts.find((a) => a.keyIndex === fromIndex) ?? accounts[0]);
	const canWrite = $derived($session.phase === 'ready');
</script>

<div class="h-full overflow-auto p-3" data-testid="contracts">
	{#if !contract}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon"><FileCodeIcon /></Empty.Media>
				<Empty.Title>No contract named {name}</Empty.Title>
				<Empty.Description>Its deployment record is gone. Deploy to write it again.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="space-y-4">
			<div class="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-3">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold" data-testid="contract-name">{contract.name}</h2>
					<Address
						value={contract.address}
						truncate={false}
						size="xs"
						mono
						class="max-w-full break-all"
						data-testid="contract-address"
					/>
				</div>
				<label class="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
					Writes are sent from
					<select
						data-testid="send-from"
						class="h-9 max-w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"
						value={from?.keyIndex}
						onchange={(event) => (fromIndex = Number(event.currentTarget.value))}
					>
						{#each accounts as account (account.keyIndex)}
							<option value={account.keyIndex} title={account.address}>{account.label} ({truncateHex(account.address)})</option>
						{/each}
					</select>
				</label>
			</div>
			<p class="text-xs text-muted-foreground">
				Reads are calls on the chain in this tab. Writes are signed with a throwaway test key and mined there at once{#if !$session.namedAccounts};
					the account names come from your config once you have deployed{/if}.
			</p>

			{#if contract.viewFunctions.length === 0 && contract.writeFunctions.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No Functions Found</Empty.Title>
						<Empty.Description>This contract has no callable functions.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<Tabs.Root value="read">
					<Tabs.List class="mb-3">
						<Tabs.Trigger value="read" data-testid="tab-read">Read ({contract.viewFunctions.length})</Tabs.Trigger>
						<Tabs.Trigger value="write" data-testid="tab-write">Write ({contract.writeFunctions.length})</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="read">
						{#if contract.viewFunctions.length > 0}
							<div class="grid gap-4 lg:grid-cols-2">
								<!-- Keyed by address and full signature: a redeploy starts fresh forms, and
								     overloads share a name. -->
								{#each contract.viewFunctions as func (`${contract.address}:${getFunctionSignature(func)}`)}
									<ContractFunction functionName={func.name} abiItem={func} {contract} chain={session} {from} {canWrite} />
								{/each}
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">This contract has no view functions.</p>
						{/if}
					</Tabs.Content>
					<Tabs.Content value="write">
						{#if contract.writeFunctions.length > 0}
							<div class="grid gap-4 lg:grid-cols-2">
								{#each contract.writeFunctions as func (`${contract.address}:${getFunctionSignature(func)}`)}
									<ContractFunction functionName={func.name} abiItem={func} {contract} chain={session} {from} {canWrite} />
								{/each}
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">This contract has no write functions.</p>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
			{/if}
		</div>
	{/if}
</div>
