import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: [
            'bench/external-runtime/portfolio.test.ts',
            'bench/external-runtime/integrity.test.ts',
            'bench/external-runtime/functional.test.ts',
        ],
        execArgv: [...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : [])],
        maxWorkers: 1,
        maxConcurrency: 2,
        fileParallelism: false,
        testTimeout: 120_000,
        reporters: ['verbose'],
    },
});
