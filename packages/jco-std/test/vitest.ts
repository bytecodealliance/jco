import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 10; // 10m

const REPORTERS = process.env.GITHUB_ACTIONS ? ["verbose", "github-actions"] : ["verbose"];

export default defineConfig({
  test: {
    reporters: REPORTERS,
    disableConsoleIntercept: true,
    printConsoleTrace: true,
    passWithNoTests: false,
    include: ["test/e2e/**/*.ts", "test/wasi/0.2.x/node/*/**/*.ts"],
    exclude: ["test/**/helpers/**"],
    setupFiles: ["test/meta-resolve-stub.ts"],
    testTimeout: DEFAULT_TIMEOUT_MS,
    hookTimeout: DEFAULT_TIMEOUT_MS,
    teardownTimeout: DEFAULT_TIMEOUT_MS,
    pool: "forks",
    // Tests run in forked workers, which do not inherit the parent's flags. `node:ffi` is only
    // reachable with `--experimental-ffi`, so pass it down when the caller enabled it; adding it
    // unconditionally would abort on Node 24, which does not know the flag.
    execArgv: [
      "--expose-gc",
      ...(process.execArgv.includes("--experimental-ffi") ? ["--experimental-ffi"] : []),
    ],
  },
});
