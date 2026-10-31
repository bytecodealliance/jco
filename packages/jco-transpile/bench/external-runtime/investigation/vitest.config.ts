import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/investigation/causes.test.ts'],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        execArgv: [...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : [])],
        reporters: ['verbose'],
    },
});
