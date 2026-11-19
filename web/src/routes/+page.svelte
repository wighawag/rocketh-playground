<script lang="ts">
	import {onMount} from 'svelte';
	import Head from '$lib/Head.svelte';
	import Playground from '$lib/components/playground/Playground.svelte';
	import {createPlayground, SOLC_VERSION} from '$lib';
	import type {PlaygroundSession} from '$lib/playground/session';

	let session: PlaygroundSession | undefined = $state();
	onMount(() => {
		const created = createPlayground();
		session = created;
		void created.start();
		return () => void created.dispose();
	});
</script>

<Head home={true} title={'rocketh playground'} />

{#if session}
	<Playground {session} solcVersion={SOLC_VERSION} />
{:else}
	<p class="p-4 text-sm">Starting the rocketh playground...</p>
{/if}
