import { URL, fileURLToPath } from "node:url";

import { defineConfig } from "rolldown";

const WORKSPACE_NODE_MODULES = fileURLToPath(new URL("../../../node_modules", import.meta.url));

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
            WORKSPACE_NODE_MODULES,
        ]
    },
});
