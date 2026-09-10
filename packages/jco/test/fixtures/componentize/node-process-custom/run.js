import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { createProcessHost } from "./provider.js";

const { instantiate } = await import(pathToFileURL(process.argv[2]));
const { host, exitRequests } = createProcessHost();
const other = createProcessHost();
const component = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    "jco:node/process": host,
});
const otherComponent = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    "jco:node/process": other.host,
});
assert.equal(await component.denied(), "ERR_JCO_PROCESS_ADAPTER_REQUIRED");
assert.deepEqual(exitRequests, []);
await assert.rejects(async () => component.run());
assert.deepEqual(exitRequests, [23]);
assert.deepEqual(other.exitRequests, []);
assert.equal(await otherComponent.denied(), "ERR_JCO_PROCESS_ADAPTER_REQUIRED");
await assert.rejects(async () => otherComponent.run());
assert.deepEqual(other.exitRequests, [23]);
assert.deepEqual(exitRequests, [23]);
assert.equal(process.exitCode, undefined);
// Reaching this output with exit status zero proves that the embedding process survived.
process.stdout.write(JSON.stringify({ exitRequests, hostAlive: true }));
