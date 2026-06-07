import { availableParallelism } from "node:os";

import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 1; // 60s
const CI_DEFAULT_TIMEOUT_MS = 1000 * 60 * 3; // 1m

const REPORTERS = process.env.GITHUB_ACTIONS ? ["verbose", "github-actions"] : ["verbose"];
const JSPI_EXEC_ARGV = "Suspending" in WebAssembly ? [] : ["--experimental-wasm-jspi"];

export default defineConfig({
    test: {
        reporters: REPORTERS,
        maxConcurrency: Math.max(availableParallelism() / 2, 5),
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        setupFiles: ["test/meta-resolve-stub.ts"],
        include: ["test/extended/**/*.js"],
        testTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        hookTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        teardownTimeout: process.env.CI ? CI_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        pool: "forks",
        execArgv: [...JSPI_EXEC_ARGV, "--stack-trace-limit=100"],
    },
});
