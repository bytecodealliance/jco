import { defineConfig } from 'vitest/config';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 10; // 10m

const REPORTERS = process.env.GITHUB_ACTIONS
    ? ['verbose', 'github-actions']
    : ['verbose'];

export default defineConfig({
    test: {
        retry: 3,
        reporters: REPORTERS,
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        include: ['test/*.js'],
        exclude: ['test/helpers.js'],
        testTimeout: DEFAULT_TIMEOUT_MS,
        hookTimeout: DEFAULT_TIMEOUT_MS,
        teardownTimeout: DEFAULT_TIMEOUT_MS,
        pool: 'forks',
        poolOptions: {
            forks: {
                execArgv: ['--expose-gc'],
            },
        },
    },
});
