import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/test/integrity.ts', 'bench/external-runtime/test/functional.ts'],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        testTimeout: 60_000,
        reporters: ['verbose'],
    },
});
