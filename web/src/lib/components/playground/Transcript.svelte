<script lang="ts">
	import type {TranscriptLine} from '$lib/playground/session';

	let {lines}: {lines: TranscriptLine[]} = $props();
	const tone: Record<string, string> = {
		error: 'text-red-400',
		warning: 'text-yellow-400',
		success: 'text-green-400',
		playground: 'text-muted-foreground',
	};
</script>

<ol data-testid="transcript" class="p-3 font-mono text-xs">
	{#each lines as line (line.seq)}
		<!-- one line: the li is whitespace-pre-wrap, so the markup's own whitespace would show -->
		<li
			class="whitespace-pre-wrap {tone[line.source] ?? ''}"
			data-source={line.source}
		>
			{line.text}{#if line.link}{' '}<a
					data-testid="transcript-link"
					class="underline"
					href={line.link.href}
					target="_blank"
					rel="noopener noreferrer">{line.link.label}</a
				>{/if}
		</li>
	{/each}
</ol>
