import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['bench/external-runtime/browser-preflight.test.ts'],
        maxWorkers: 1,
        maxConcurrency: 1,
        fileParallelism: false,
        reporters: ['verbose'],
    },
});
