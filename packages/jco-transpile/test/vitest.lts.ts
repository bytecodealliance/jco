import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 1; // 60s
const CI_DEFAULT_TIMEOUT_MS = 1000 * 60 * 3; // 1m

const REPORTERS = process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'];

const NODE_MAJOR_VERSION = parseInt(process.versions.node);
const JSPI_EXEC_ARGV =
    !('Suspending' in WebAssembly) && NODE_MAJOR_VERSION >= 22 && NODE_MAJOR_VERSION < 26
        ? ['--experimental-wasm-jspi']
        : [];

export default defineConfig({
    test: {
        retry: 0,
        reporters: REPORTERS,
        maxConcurrency: Math.max(availableParallelism() / 2, 5),
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        include: ['test/*.ts'],
        exclude: [
            'test/helpers.ts',
            'test/common.ts',
            'test/output',
            'test/fixtures',
            'test/vitest.ts',
            'test/vitest.lts.ts',
            'test/p3/ported/wasmtime/component-async/common.ts',
        ],
        testTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        hookTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        teardownTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        pool: 'forks',
        execArgv: [...JSPI_EXEC_ARGV, '--stack-trace-limit=100'],
    },
});
