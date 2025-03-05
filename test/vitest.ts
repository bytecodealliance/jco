import { availableParallelism, platform } from "node:os";

import { defineConfig } from "vitest/config";

const TIMEOUT_MULTIPLE = platform() === "win32" ? 2 : 1;
const DEFAULT_TIMEOUT_MS = 1000 * 60 * 8 * TIMEOUT_MULTIPLE; // 8m non-windows, 16m windows

const REPORTERS = process.env.GITHUB_ACTIONS
  ? ["verbose", "github-actions"]
  : ["verbose"];

export default defineConfig({
  test: {
    reporters: REPORTERS,
    maxConcurrency: Math.max(availableParallelism() / 2, 5),
    disableConsoleIntercept: true,
    printConsoleTrace: true,
    passWithNoTests: false,
    include: ["test/*.js"],
    setupFiles: ["test/meta-resolve-stub.ts"],
    exclude: [
      "test/output/*",
      "test/fixtures/*",
      "test/common.js",
      "test/helpers.js",
    ],
    testTimeout: DEFAULT_TIMEOUT_MS,
    hookTimeout: DEFAULT_TIMEOUT_MS,
    teardownTimeout: DEFAULT_TIMEOUT_MS,
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--experimental-wasm-jspi", "--stack-trace-limit=100"],
      },
    },
  },
});
