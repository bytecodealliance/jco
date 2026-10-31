import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/foundation.test.ts', 'bench/external-runtime/integrity.test.ts'],
        // Timing gates require an otherwise idle process, independent of the
        // ordinary functional suites and their inline/external matrix.
        execArgv: [...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : [])],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        sequence: { concurrent: false },
        testTimeout: 180_000,
        reporters: ['verbose'],
    },
});
