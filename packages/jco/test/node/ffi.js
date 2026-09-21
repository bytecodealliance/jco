import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { suite, test } from "vitest";

import { componentizeFixture, transpileComponent } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/26.x.x/ffi-host-node.js", import.meta.url)),
).href;

const UNSUPPORTED = "ERR_JCO_UNSUPPORTED_NODE_API";

// The host adapter requires a runtime with node:ffi enabled via --experimental-ffi.
function loadHostFfi() {
    try {
        return createRequire(import.meta.url)("node:ffi");
    } catch {
        return undefined;
    }
}

const HOST_FFI = loadHostFfi();

suite("node:ffi in a component", () => {
    test.skipIf(!HOST_FFI)("componentizes and calls native code through the opt-in Node host", async () => {
        // Built from a copy: componentizing rewrites the world in place to add the WIT import.
        const { componentPath, fixtureDir, stderr } = await componentizeFixture({
            fixture: "node-ffi",
            entry: "source.js",
            wit: "wit",
            world: "test",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });

        assert.ok(stderr.includes("Jco added generated WIT import jco:node/ffi@0.1.0"));
        const componentWit = await readFile(join(fixtureDir, "wit/component.wit"), "utf8");
        assert.ok(componentWit.includes("import jco:node/ffi@0.1.0;"));

        const { modulePath } = await transpileComponent({
            componentPath,
            name: "node-ffi",
            extraArgs: ["--map", `jco:node/ffi@0.1.0=${NODE_HOST}`],
        });

        const component = await import(modulePath);
        assert.deepEqual(JSON.parse(component.run()), {
            // Native code really ran, on the host, called from inside the component.
            abs: 7,
            allocated: true,
            readBack: 123456,
            text: "hello ffi",
            nativeLength: "9",
            bytes: [104, 101, 108, 108, 111],
            symbolIsBigInt: true,
            eventLoop: true,
            // Node reports the host platform's suffix: `so`, `dylib`, or `dll`.
            suffix: HOST_FFI.suffix,

            // What a component cannot express, refused rather than answered wrongly.
            rawPointer: UNSUPPORTED,
            liveView: UNSUPPORTED,
            callback: UNSUPPORTED,
            bufferArgument: UNSUPPORTED,

            afterClose: "ERR_FFI_LIBRARY_CLOSED",
        });
    });
});
