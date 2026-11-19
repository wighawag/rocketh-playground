<script lang="ts">
	import {Button} from '$lib/core/ui/button';
	import type {PlaygroundSession} from '$lib/playground/session';
	import {compilerLabel, lastRunLabel, phaseLabel} from '$lib/playground/format';
	import FileList from './FileList.svelte';
	import FileView from './FileView.svelte';
	import Transcript from './Transcript.svelte';

	let {session, solcVersion}: {session: PlaygroundSession; solcVersion: string} = $props();
	const busy = $derived($session.phase === 'compiling' || $session.phase === 'transpiling' || $session.phase === 'running');
</script>

<div class="flex h-dvh flex-col bg-background text-foreground">
	<header class="flex flex-wrap items-center gap-3 border-b px-4 py-2">
		<h1 class="text-lg font-semibold">rocketh playground</h1>
		<Button data-testid="deploy" onclick={() => session.deploy()} disabled={$session.phase !== 'ready'}>Deploy</Button>
		<Button data-testid="stop" variant="outline" onclick={() => session.stop()} disabled={$session.phase !== 'running'}>Stop</Button>
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
		<nav class="overflow-auto border-b p-2 md:row-span-2 md:border-r md:border-b-0">
			<FileList state={$session} onselect={(path) => session.select(path)} />
		</nav>
		<section class="min-h-64 overflow-hidden">
			<FileView state={$session} {session} onedit={(path, text) => session.edit(path, text)} />
		</section>
		<section class="min-h-48 overflow-auto border-t">
			<Transcript lines={$session.transcript} />
		</section>
	</main>

	<footer class="border-t px-4 py-1 text-xs text-muted-foreground">
		Everything runs in this tab: the compiler, the chain and your scripts, which run in a worker and can fetch any URL, like any page you choose to run. The accounts are well-known throwaway test keys. Nothing is sent to a network.
	</footer>
</div>
