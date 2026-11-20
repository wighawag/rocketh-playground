<script lang="ts">
	import {Button} from '$lib/core/ui/button';
	import * as Dialog from '$lib/shadcn/ui/dialog';
	import type {PlaygroundSession} from '$lib/playground/session';
	import {compilerLabel, lastRunLabel, phaseLabel} from '$lib/playground/format';
	import {canDownload, createProjectDownload} from '$lib/playground/project/download';
	import {canShare, createProjectShare, tooBigLabel} from '$lib/playground/project/share';
	import type {LinkOpener} from '$lib/playground/project/open-link';
	import FileList from './FileList.svelte';
	import FileView from './FileView.svelte';
	import Transcript from './Transcript.svelte';

	let {session, link, solcVersion}: {session: PlaygroundSession; link: LinkOpener; solcVersion: string} = $props();
	const busy = $derived(
		$session.phase === 'compiling' || $session.phase === 'transpiling' || $session.phase === 'running' || $session.phase === 'sending' || $session.phase === 'resetting',
	);
	// Download builds the zip on demand: fflate loads on the first press.
	const projectDownload = createProjectDownload();
	// Share encodes on demand too: fflate loads on the first press.
	const projectShare = createProjectShare();
	const sharing = $derived($projectShare.status === 'shared' || $projectShare.status === 'too-big' || $projectShare.status === 'failed');
	/** Whether the Reset confirmation is open. */
	let confirmingReset = $state(false);
	function confirmReset() {
		confirmingReset = false;
		// the views show the chain that is going away
		contract = undefined;
		transactions = false;
		void session.reset();
	}
	/** The contract the centre pane shows instead of a file, when one is picked. */
	let contract = $state<string | undefined>();
	/** Whether the centre pane shows the chain's transactions. */
	let transactions = $state(false);
	// the views show the chain a shared link replaces
	$effect(() => {
		if ($link.status === 'opening') {
			contract = undefined;
			transactions = false;
		}
	});
	// Loaded on first use: it brings viem's ABI and signing code, which a first visit does not need.
	const loadContracts = () => import('./Contracts.svelte');
	// Loaded on first use too: viem's client and the decoders.
	const loadTransactions = () => import('./Transactions.svelte');
</script>

<div class="flex h-dvh flex-col bg-background text-foreground">
	<header class="flex flex-wrap items-center gap-3 border-b px-4 py-2">
		<h1 class="text-lg font-semibold">rocketh playground</h1>
		<Button data-testid="deploy" onclick={() => session.deploy()} disabled={$session.phase !== 'ready'}>Deploy</Button>
		<Button data-testid="stop" variant="outline" onclick={() => session.stop()} disabled={$session.phase !== 'running'}>Stop</Button>
		<Button data-testid="reset" variant="outline" onclick={() => (confirmingReset = true)} disabled={$session.phase !== 'ready'}>Reset</Button>
		<Button
			data-testid="download"
			variant="outline"
			onclick={() => projectDownload.download($session.files)}
			disabled={!canDownload($session.phase) || $projectDownload.status === 'building'}>Download</Button
		>
		<Button
			data-testid="share"
			variant="outline"
			onclick={() => projectShare.share($session.files)}
			disabled={!canShare($session.phase) || $projectShare.status === 'building'}>Share</Button
		>
		{#if $projectDownload.status === 'failed'}
			<span data-testid="download-error" class="text-sm text-red-400">The download failed: {$projectDownload.error}</span>
		{/if}
		{#if $link.status === 'invalid' || $link.status === 'failed'}
			<span data-testid="link-error" class="text-sm text-red-400">
				The shared link could not be opened: {$link.error}. Nothing was loaded from it.
				<button class="underline" onclick={() => link.dismiss()}>Dismiss</button>
			</span>
		{/if}
		<span data-testid="phase" data-phase={$session.phase} class="text-sm">
			{phaseLabel($session.phase)}{#if busy}...{/if}
		</span>
		{#if $session.lastRun && !busy}
			<span data-testid="last-run" class="text-sm text-muted-foreground">{lastRunLabel($session.lastRun)}</span>
		{/if}
		<span class="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
			<span data-testid="compiler" data-status={$session.compiler.status}>{compilerLabel($session.compiler, solcVersion)}</span>
			{#if $session.typescriptVersion}<span>TypeScript {$session.typescriptVersion}</span>{/if}
			{#if $session.blockNumber !== undefined}<span data-testid="block">chain at block {$session.blockNumber}</span>{/if}
		</span>
	</header>

	<main class="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:overflow-hidden md:grid-cols-[16rem_1fr] md:grid-rows-[1fr_16rem]">
		<nav class="overflow-auto border-b p-2 max-md:overflow-visible md:row-span-2 md:border-r md:border-b-0">
			<FileList
				state={$session}
				selectedContract={contract}
				transactionsShown={transactions}
				onselect={(path) => {
					contract = undefined;
					transactions = false;
					session.select(path);
				}}
				oncontract={(name) => {
					transactions = false;
					contract = name;
				}}
				ontransactions={() => {
					contract = undefined;
					transactions = true;
				}}
			/>
		</nav>
		<!-- On a phone the Contracts and Transactions views get most of the screen (the editor's
		     minimum is too short for a card), scrolling within it like the editor; the page scrolls
		     to the transcript. -->
		<section class={contract !== undefined || transactions ? 'min-h-[70dvh] overflow-hidden md:min-h-64' : 'min-h-64 overflow-hidden'}>
			{#if transactions}
				{#await loadTransactions()}
					<p class="p-3 text-sm text-muted-foreground">Loading the Transactions view...</p>
				{:then {default: Transactions}}
					<Transactions {session} />
				{:catch error}
					<p class="p-3 text-sm text-red-400">The Transactions view did not load: {error.message}</p>
				{/await}
			{:else if contract !== undefined}
				{#await loadContracts()}
					<p class="p-3 text-sm text-muted-foreground">Loading the Contracts view...</p>
				{:then {default: Contracts}}
					<Contracts {session} name={contract} />
				{:catch error}
					<p class="p-3 text-sm text-red-400">The Contracts view did not load: {error.message}</p>
				{/await}
			{:else}
				<FileView state={$session} {session} onedit={(path, text) => session.edit(path, text)} />
			{/if}
		</section>
		<section class="min-h-48 overflow-auto border-t">
			<Transcript lines={$session.transcript} />
		</section>
	</main>

	<Dialog.Root bind:open={confirmingReset}>
		<Dialog.Content data-testid="reset-dialog">
			<Dialog.Header>
				<Dialog.Title>Start again from the starting project?</Dialog.Title>
				<Dialog.Description>
					Your edits, the chain in this tab and the deployment records are thrown away, here and in this browser's storage. This cannot be undone.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button data-testid="reset-cancel" variant="outline" onclick={() => (confirmingReset = false)}>Cancel</Button>
				<Button data-testid="reset-confirm" variant="destructive" onclick={confirmReset} disabled={$session.phase !== 'ready'}>Reset</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<Dialog.Root open={sharing} onOpenChange={(open) => !open && projectShare.close()}>
		<Dialog.Content data-testid="share-dialog">
			{#if $projectShare.status === 'shared'}
				<Dialog.Header>
					<Dialog.Title>Share this project</Dialog.Title>
					<Dialog.Description data-testid="share-copied">
						{$projectShare.copied ? 'The link is copied to the clipboard.' : 'Copy the link below.'} The files are in the link itself, after the #, which is never sent to a server. Opening it runs nothing until Deploy is pressed.
					</Dialog.Description>
				</Dialog.Header>
				<input data-testid="share-link" readonly value={$projectShare.link} class="w-full rounded border bg-transparent px-2 py-1 font-mono text-xs" onfocus={(e) => e.currentTarget.select()} />
			{:else if $projectShare.status === 'too-big'}
				<Dialog.Header>
					<Dialog.Title>Too big for a link</Dialog.Title>
					<Dialog.Description data-testid="share-too-big">{tooBigLabel($projectShare.length)}</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button data-testid="share-download" onclick={() => projectDownload.download($session.files)} disabled={$projectDownload.status === 'building'}>Download</Button>
				</Dialog.Footer>
			{:else if $projectShare.status === 'failed'}
				<Dialog.Header>
					<Dialog.Title>Share failed</Dialog.Title>
					<Dialog.Description data-testid="share-error">{$projectShare.error}</Dialog.Description>
				</Dialog.Header>
			{/if}
		</Dialog.Content>
	</Dialog.Root>

	<Dialog.Root open={$link.status === 'confirm'} onOpenChange={(open) => !open && link.cancel()}>
		<Dialog.Content data-testid="link-dialog">
			<Dialog.Header>
				<Dialog.Title>Open the shared project?</Dialog.Title>
				<Dialog.Description>
					This link holds a project. Opening it replaces your files, the chain in this tab and the deployment records, here and in this browser's storage. Download your project first to keep a copy. Nothing in the link runs until you press Deploy.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button data-testid="link-download" variant="outline" onclick={() => projectDownload.download($session.files)} disabled={$projectDownload.status === 'building'}>Download</Button>
				<Button data-testid="link-cancel" variant="outline" onclick={() => link.cancel()}>Cancel</Button>
				<Button data-testid="link-open" variant="destructive" onclick={() => link.confirm()} disabled={$session.phase !== 'ready'}>Open</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<footer class="border-t px-4 py-1 text-xs text-muted-foreground">
		Everything runs in this tab: the compiler, the chain and your scripts, which run in a worker and can fetch any URL, like any page you choose to run. The accounts are well-known throwaway test keys. Nothing is sent to a network.
	</footer>
</div>
