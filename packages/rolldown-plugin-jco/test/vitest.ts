import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.ts"],
        exclude: ["test/vitest.ts", "test/types.ts", "test/fixtures/**"],
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
