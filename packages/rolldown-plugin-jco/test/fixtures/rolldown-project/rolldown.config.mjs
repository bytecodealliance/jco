import { defineConfig } from "rolldown";
import jco from "@bytecodealliance/rolldown-plugin-jco";
import { fileURLToPath } from "node:url";

export default defineConfig({
    input: fileURLToPath(new URL("./src/index.js", import.meta.url)),
    external: (id) => id.startsWith("node:"),
    plugins: [
        jco({
            transpile: {
                base64Cutoff: 0,
            },
        }),
    ],
    output: {
        dir: fileURLToPath(new URL("./dist", import.meta.url)),
        format: "esm",
        entryFileNames: "index.mjs",
        assetFileNames: "assets/[name]-[hash][extname]",
    },
});
