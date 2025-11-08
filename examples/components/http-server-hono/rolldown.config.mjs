import { defineConfig } from "rolldown";

export default defineConfig({
    input: "src/component.ts",
    external: /wasi:.*/,
    output: {
        file: "dist/component.js",
        format: "esm",
    },
    resolve: {
        modules: [
            "node_modules",
            "../../../node_modules",
        ]
    },
});
