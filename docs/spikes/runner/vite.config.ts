import {defineConfig} from 'vite';

export default defineConfig({
	build: {target: 'es2022', reportCompressedSize: false},
	worker: {format: 'es'},
});
