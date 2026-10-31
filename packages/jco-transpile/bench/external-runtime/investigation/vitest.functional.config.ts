import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: [
            'bench/external-runtime/investigation/node-worker.test.ts',
            'bench/external-runtime/investigation/frozen-replay.test.ts',
            'bench/external-runtime/investigation/shapes.test.ts',
            'bench/external-runtime/investigation/transforms.test.ts',
            'bench/external-runtime/investigation/runtime-resolution.test.ts',
            'bench/external-runtime/investigation/matched-protocol.test.ts',
            'bench/external-runtime/investigation/collector.test.ts',
        ],
        testTimeout: 30_000,
        maxWorkers: 1,
        maxConcurrency: 4,
        reporters: ['verbose'],
    },
});
