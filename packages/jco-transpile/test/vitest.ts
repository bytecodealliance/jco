import { defineConfig } from 'vitest/config';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 1; // 10m
const CI_DEFAULT_TIMEOUT_MS = 1000 * 60 * 3; // 1m

const REPORTERS = process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'];
const JSPI_EXEC_ARGV = 'Suspending' in WebAssembly ? [] : ['--experimental-wasm-jspi'];

export default defineConfig({
    test: {
        reporters: REPORTERS,
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        include: ['test/**/*.ts'],
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
        execArgv: ['--expose-gc', ...JSPI_EXEC_ARGV, '--stack-trace-limit=100'],
        pool: 'forks',
    },
});
