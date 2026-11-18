import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 10; // 10m

const REPORTERS = process.env.GITHUB_ACTIONS ? ["verbose", "github-actions"] : ["verbose"];

/** Files that only make sense with the setup of the "performance" project. */
const PERFORMANCE_ONLY = ["test/performance-project.ts"];

const SUPPORT_FILES = [
    "test/common.ts",
    "test/filesystem-conformance.ts",
    "test/performance-setup.ts",
    "test/vitest.ts",
];

export default defineConfig({
    test: {
        reporters: REPORTERS,
        disableConsoleIntercept: true,
        printConsoleTrace: true,
        passWithNoTests: false,
        testTimeout: DEFAULT_TIMEOUT_MS,
        hookTimeout: DEFAULT_TIMEOUT_MS,
        teardownTimeout: DEFAULT_TIMEOUT_MS,
        pool: "forks",
        execArgv: ["--expose-gc"],
        projects: [
            {
                extends: true,
                test: {
                    name: "default",
                    include: ["test/*.ts", "test/browser/**/*.ts"],
                    exclude: [...SUPPORT_FILES, ...PERFORMANCE_ONLY],
                },
            },
            {
                // The Node.js filesystem and I/O suites again, with every
                // `performance` option of the filesystem turned on.
                extends: true,
                test: {
                    name: "performance",
                    include: [
                        "test/node.ts",
                        "test/node-filesystem-*.ts",
                        "test/io-worker.ts",
                        ...PERFORMANCE_ONLY,
                    ],
                    // These load the filesystem from source under mocks, which the setup
                    // file does not reach.
                    exclude: ["test/node-filesystem-windows*.ts"],
                    setupFiles: ["test/performance-setup.ts"],
                },
            },
        ],
    },
});
