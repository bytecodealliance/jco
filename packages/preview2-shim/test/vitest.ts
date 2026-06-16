import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 10; // 10m

const REPORTERS = process.env.GITHUB_ACTIONS ? ["verbose", "github-actions"] : ["verbose"];

export default defineConfig({
  test: {
    reporters: REPORTERS,
    disableConsoleIntercept: true,
    printConsoleTrace: true,
    passWithNoTests: false,
    include: ["test/*.ts"],
    exclude: ["test/common.ts", "test/vitest.ts"],
    testTimeout: DEFAULT_TIMEOUT_MS,
    hookTimeout: DEFAULT_TIMEOUT_MS,
    teardownTimeout: DEFAULT_TIMEOUT_MS,
    pool: "forks",
    execArgv: ["--expose-gc"],
  },
});
