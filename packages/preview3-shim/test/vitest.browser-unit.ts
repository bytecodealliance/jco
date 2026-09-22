import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    conditions: ["browser"],
    alias: [
      {
        find: /^@bytecodealliance\/preview3-shim\/(.+)$/,
        replacement: `${fileURLToPath(new URL("../dist/browser/", import.meta.url))}$1.js`,
      },
      {
        find: /^@bytecodealliance\/preview2-shim\/(.+)$/,
        replacement: `${fileURLToPath(new URL("../../preview2-shim/dist/browser/", import.meta.url))}$1.js`,
      },
    ],
  },
  test: {
    include: ["test/browser-unit/**/*.js"],
    testTimeout: 30_000,
  },
});
