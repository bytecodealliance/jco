import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';

const DEFAULT_TIMEOUT_MS = 1000 * 60;
const CI_DEFAULT_TIMEOUT_MS = 1000 * 60 * 3;

const REPORTERS = process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'];
const JSPI_EXEC_ARGV = 'Suspending' in WebAssembly ? [] : ['--experimental-wasm-jspi'];

export default defineConfig({
    test: {
        reporters: REPORTERS,
        maxConcurrency: Math.max(availableParallelism() / 2, 5),
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        include: ['test/extended/**/*.ts'],
        testTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        hookTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        teardownTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        pool: 'forks',
        execArgv: ['--expose-gc', ...JSPI_EXEC_ARGV, '--stack-trace-limit=100'],
    },
});
