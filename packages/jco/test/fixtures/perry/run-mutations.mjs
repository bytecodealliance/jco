import { fileURLToPath } from "node:url";
import { filesystem } from "@bytecodealliance/preview2-shim";

// Copied into the temporary project's scripts/ directory. Omitting the argument
// exercises legacy defaults with the exact same component and preopened data.
const preopens = { "/data": fileURLToPath(new URL("../data/", import.meta.url)) };
if (process.argv.includes("--enable-mutate-directory")) {
    filesystem._setPreopens(preopens, { enableMutateDirectory: true });
} else {
    filesystem._setPreopens(preopens);
}
const { run } = await import("../dist/transpiled/component.js");
run.run();
