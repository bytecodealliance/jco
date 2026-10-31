import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/investigation/test/causes.ts'],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        execArgv: [...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : [])],
        reporters: ['verbose'],
    },
});
