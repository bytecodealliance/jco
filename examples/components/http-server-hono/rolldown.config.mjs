import { env } from "node:process";
import { URL, fileURLToPath } from "node:url";
import { join } from "node:path";

import { defineConfig } from "rolldown";

// For some reason, rolldown will not properly resolve node modules when
// in GitHub CI.
//
// The code below creates a manual mapping of the jco-std imports (and modified alias)
// for CI environments and is NOT needed in a regular project
const WORKSPACE_JCO_STD = fileURLToPath(new URL("../../../node_modules/@bytecodealliance/jco-std", import.meta.url));

const alias = env.CI ? {
    '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono': join(WORKSPACE_JCO_STD, "dist/0.2.3/http/adapters/hono.js"),
    '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono': join(WORKSPACE_JCO_STD, "dist/0.2.6/http/adapters/hono.js"),
} : {};

export default defineConfig({
    input: "src/component.ts",
    external: /wasi:.*/,
    output: {
        file: "dist/component.js",
        format: "esm",
    },
    resolve: { alias },
});
