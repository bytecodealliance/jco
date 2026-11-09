import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/test/integrity.ts', 'bench/external-runtime/test/functional.ts'],
        execArgv: [...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : [])],
        maxWorkers: 1,
        maxConcurrency: 2,
        fileParallelism: false,
        testTimeout: 120_000,
        reporters: ['verbose'],
    },
});
