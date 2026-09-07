import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.js"],
    exclude: ["test/helpers.js", "test/nop-worker.js", "test/**/*.bench.js"],
  },
});
