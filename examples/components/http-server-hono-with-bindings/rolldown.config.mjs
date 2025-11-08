import { defineConfig } from "rolldown";

export default defineConfig([
    {
        input: "src/guest/component.ts",
        external: /wasi:.*/,
        output: {
            file: "dist/guest/component.js",
            format: "esm",
        },
    },
    {
        input: "src/host/bindings/*.ts",
        external: /wasi:.*/,
        output: {
            dir: "dist/host/bindings",
            format: "esm",
        },
    }
]);
