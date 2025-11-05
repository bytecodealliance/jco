import { availableParallelism, platform } from "node:os";

import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 10; // 10m

const REPORTERS = process.env.GITHUB_ACTIONS
    ? ["verbose", "github-actions"]
    : ["verbose"];

export default defineConfig({
    test: {
        retry: 0,
        reporters: REPORTERS,
        maxConcurrency: Math.max(availableParallelism() / 2, 5),
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        setupFiles: ["test/meta-resolve-stub.ts"],
        include: ["test/*.js"],
        exclude: [
            "test/output/*",
            "test/fixtures/*",
            "test/common.js",
            "test/helpers.js",
            "test/p3/ported/wasmtime/component-async/common.js",
        ],
        testTimeout: DEFAULT_TIMEOUT_MS,
        hookTimeout: DEFAULT_TIMEOUT_MS,
        teardownTimeout: DEFAULT_TIMEOUT_MS,
    },
});
