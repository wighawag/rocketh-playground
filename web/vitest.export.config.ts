/**
 * `pnpm test:export`: installs and deploys the project Download exports (`test/export/`).
 *
 * Its own config, so `pnpm test` (and `pnpm verify`) never runs it: it needs the network and
 * takes minutes. vitest still runs it through vite, so `project/template.ts` reads the template
 * with `import.meta.glob` as it does in the app. No plugin is needed for that.
 */
import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/export/**/*.export.ts'],
		testTimeout: 20 * 60 * 1000,
		hookTimeout: 5 * 60 * 1000,
		// the projects share one temporary pnpm store, and the network: one at a time
		fileParallelism: false,
	},
});
