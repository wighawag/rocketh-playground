<!--
	Copied from jolly-roger web/src/routes/contracts/components/ContractFunction.svelte, at
	commit 8a73e680: the card, the arguments, the error and the read result are that file's.
	Changed here:
	- the state and `handleFetch` / `handleExecute` moved to a store,
	  $lib/playground/contracts/function-call.ts, which this component creates and renders;
	- the write half is the playground's: no wallet, connection, executor or balance check. A
	  write is signed with a throwaway test key, from the account the view's picker names
	  (`from`), and sent to the chain in the tab; the card shows its hash, from whom, the block
	  and whether it succeeded, instead of a link to jolly-roger's explorer
	  ($lib/core/ui/ethereum/TransactionHash.svelte, whose imports reach jolly-roger's app layer);
	- `canWrite`, so a write waits while a run uses the chain;
	- the unused Address import is gone; data-testid attributes for the browser tests.
-->
<script lang="ts">
	import type {AbiFunction} from 'viem';
	import * as Card from '$lib/shadcn/ui/card';
	import {Button} from '$lib/shadcn/ui/button';
	import FunctionInputs from './FunctionInputs.svelte';
	import {
		formatFunctionSignature,
		isViewFunction,
		formatOutputJSON,
	} from '../lib/utils';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Alert from '$lib/shadcn/ui/alert';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import type {ContractTarget} from '$lib/playground/contracts/chain-calls';
	import type {SigningAccount} from '$lib/playground/contracts/accounts';
	import {
		createFunctionCall,
		type ContractsChain,
	} from '$lib/playground/contracts/function-call';

	interface Props {
		functionName: string;
		abiItem: AbiFunction;
		contract: ContractTarget;
		chain: ContractsChain;
		from: SigningAccount | undefined;
		canWrite: boolean;
	}

	let {functionName, abiItem, contract, chain, from, canWrite}: Props =
		$props();

	let inputValues = $state<Record<string, string>>({});
	let inputErrors = $state<Record<string, string>>({});

	const call = createFunctionCall({
		abiItem: () => abiItem,
		contract: () => contract,
		chain: () => chain,
	});

	let isView = $derived(isViewFunction(abiItem.stateMutability));
	let idPrefix = $derived(`${contract.address}-${functionName}-`);
</script>

<Card.Root class="border-2" data-testid="function" data-function={functionName}>
	<Card.Header>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1 space-y-1">
				<Card.Title class="font-mono text-base">
					{functionName}
					<span
						class="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
						class:bg-muted-foreground={isView}
						class:text-background={isView}
						class:bg-primary={!isView}
						class:text-primary-foreground={!isView}
					>
						{abiItem.stateMutability}
					</span>
				</Card.Title>
				<Card.Description class="font-mono text-xs break-all">
					{formatFunctionSignature(abiItem)}
				</Card.Description>
			</div>
		</div>
	</Card.Header>

	<Card.Content class="space-y-4">
		{#if abiItem.inputs.length > 0}
			<div class="space-y-2">
				<div class="text-sm font-medium">Arguments</div>
				<FunctionInputs
					inputs={abiItem.inputs}
					values={inputValues}
					errors={inputErrors}
					{idPrefix}
				/>
			</div>
		{/if}

		{#if $call.error}
			<Alert.Root variant="destructive" class="max-w-full overflow-hidden">
				<CircleAlertIcon class="h-4 w-4 shrink-0" />
				<Alert.Description
					data-testid="call-error"
					class="overflow-wrap-break-word max-h-32 min-w-0 overflow-y-auto text-sm wrap-break-word"
					>{$call.error}</Alert.Description
				>
			</Alert.Root>
		{/if}

		{#if $call.result !== null}
			<div class="space-y-2">
				<div
					class="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400"
				>
					<CircleCheckIcon class="h-4 w-4" />
					<span>Result</span>
				</div>
				<pre
					data-testid="call-result"
					class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"><code
						>{formatOutputJSON($call.result)}</code
					></pre>
			</div>
		{/if}

		{#if $call.transaction}
			<Alert.Root>
				<InfoIcon class="h-4 w-4" />
				<Alert.Description
					class="flex min-w-0 flex-col gap-1 text-sm"
					data-testid="call-transaction"
					data-status={$call.transaction.status}
				>
					<span class="font-medium"
						>{$call.transaction.status === 'success'
							? 'Transaction mined'
							: 'Transaction mined, and reverted'} in block {$call.transaction.blockNumber}</span
					>
					<span class="font-mono text-xs break-all" data-testid="tx-hash"
						>{$call.transaction.hash}</span
					>
					<span class="text-xs text-muted-foreground"
						>from {$call.transaction.fromLabel}, gas used {$call.transaction.gasUsed}</span
					>
				</Alert.Description>
			</Alert.Root>
		{/if}
	</Card.Content>

	<Card.Footer class="flex gap-2">
		{#if isView}
			<Button
				data-testid="call"
				onclick={() => call.read(inputValues)}
				disabled={$call.loading}
				class="flex-1"
				variant={$call.result !== null ? 'outline' : 'default'}
			>
				{#if $call.loading}
					<Spinner />
					Fetching...
				{:else}
					Fetch Value
				{/if}
			</Button>
		{:else}
			<Button
				data-testid="call"
				onclick={() => from && call.write(inputValues, inputErrors, from)}
				disabled={$call.loading || !canWrite || !from}
				class="flex-1"
				variant={$call.transaction ? 'outline' : 'default'}
			>
				{#if $call.loading}
					<Spinner />
					Sending...
				{:else}
					{from ? `Send from ${from.label}` : 'Send'}
				{/if}
			</Button>
		{/if}

		{#if $call.result !== null || $call.transaction !== null || $call.error !== null}
			<Button onclick={() => call.clear()} variant="ghost" disabled={$call.loading}>
				Clear
			</Button>
		{/if}
	</Card.Footer>
</Card.Root>
