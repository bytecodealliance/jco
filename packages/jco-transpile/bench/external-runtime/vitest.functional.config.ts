import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['bench/external-runtime/integrity.test.ts', 'bench/external-runtime/functional.test.ts'],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        testTimeout: 60_000,
        reporters: ['verbose'],
    },
});
