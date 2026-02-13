import { env } from "node:process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

/** Path to a linter as installed by npm-compatible tooling */
export const LINTER_PATH = fileURLToPath(new URL("../../../node_modules/oxlint/bin/oxlint", import.meta.url));

export const AsyncFunction = (async () => {}).constructor;

/** Path to `tsc` binary as installed by npm-compatible tooling */
export const NODE_MODULES_TSC_BIN_PATH = fileURLToPath(
    new URL("../../../node_modules/typescript/bin/tsc", import.meta.url),
);

/** Path to Jco JS script */
export const JCO_JS_PATH = fileURLToPath(new URL("../src/jco.js", import.meta.url));

/** Path to fixture components */
export const COMPONENT_FIXTURES_DIR = fileURLToPath(new URL("./fixtures/components", import.meta.url));

/** Path to p3 related fixture components */
export const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, "p3");

/** Path to built custom rust components (i.e. output of `cargo xtask build-test-components`) */
export const LOCAL_TEST_COMPONENTS_DIR = join(COMPONENT_FIXTURES_DIR, "../../output/rust-test-components");

/**
 * Retrieve a list of all component fixtures
 *
 * Customize COMPONENT_FIXTURES env vars to use alternative test components
 *
 * COMPONENT_FIXTURES is a comma-separated list of component names ending in
 * ".component.wasm".
 *
 * Each of these components will then be passed through code generation and linting.
 *
 * If a local runtime host.ts file is present for the component name in test/runtime/[name]/host.ts
 * then the runtime test will be performed against that execution.
 *
 * When the runtime test is present, the flags in the runtime host.ts file will be used
 * as the flags of the code generation step.
 */
export async function getDefaultComponentFixtures() {
    return env.COMPONENT_FIXTURES
        ? env.COMPONENT_FIXTURES.split(",")
        : (await readdir("test/fixtures/components", { withFileTypes: true }))
              .filter((f) => f.isFile() && f.name !== "dummy_reactor.component.wasm")
              .map((f) => f.name);
}
