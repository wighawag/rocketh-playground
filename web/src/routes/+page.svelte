<script lang="ts">
	import {onMount} from 'svelte';
	import Head from '$lib/Head.svelte';
	import Playground from '$lib/components/playground/Playground.svelte';
	import {createPlayground, openSharedLink, SOLC_VERSION} from '$lib';
	import type {PlaygroundSession} from '$lib/playground/session';
	import type {LinkOpener} from '$lib/playground/project/open-link';

	let session: PlaygroundSession | undefined = $state();
	let link: LinkOpener | undefined = $state();
	onMount(() => {
		const created = createPlayground();
		const opener = openSharedLink(created);
		session = created;
		link = opener;
		void created.start();
		void opener.begin();
		return () => void created.dispose();
	});
</script>

<Head home={true} title={'rocketh playground'} />

{#if session && link}
	<Playground {session} {link} solcVersion={SOLC_VERSION} />
{:else}
	<p class="p-4 text-sm">Starting the rocketh playground...</p>
{/if}
