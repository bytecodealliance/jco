import { env } from "node:process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

/** Path to ESLint as installed by npm-compatible tooling */
export const ESLINT_PATH = fileURLToPath(
  new URL("../node_modules/eslint/bin/eslint.js", import.meta.url)
);

export const AsyncFunction = (async () => {}).constructor;

/** Path to `tsc` binary as installed by npm-compatible tooling */
export const NODE_MODULES_TSC_BIN_PATH = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url)
);
