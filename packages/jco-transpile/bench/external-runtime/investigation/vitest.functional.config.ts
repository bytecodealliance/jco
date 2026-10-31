import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: [
            'bench/external-runtime/investigation/test/node-worker.ts',
            'bench/external-runtime/investigation/test/frozen-replay.ts',
            'bench/external-runtime/investigation/test/shapes.ts',
            'bench/external-runtime/investigation/test/transforms.ts',
            'bench/external-runtime/investigation/test/runtime-resolution.ts',
            'bench/external-runtime/investigation/test/matched-protocol.ts',
            'bench/external-runtime/investigation/test/collector.ts',
        ],
        testTimeout: 30_000,
        maxWorkers: 1,
        maxConcurrency: 4,
        reporters: ['verbose'],
    },
});
