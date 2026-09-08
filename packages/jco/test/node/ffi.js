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
function hostHasFfi() {
    try {
        createRequire(import.meta.url)("node:ffi");
        return true;
    } catch {
        return false;
    }
}

suite("node:ffi in a component", () => {
    test.skipIf(!hostHasFfi())("componentizes and calls native code through the opt-in Node host", async () => {
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

        assert.include(stderr, "Jco added generated WIT import jco:node/ffi@0.1.0");
        assert.include(await readFile(join(fixtureDir, "wit/component.wit"), "utf8"), "import jco:node/ffi@0.1.0;");

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
            suffix: "so",

            // What a component cannot express, refused rather than answered wrongly.
            rawPointer: UNSUPPORTED,
            liveView: UNSUPPORTED,
            callback: UNSUPPORTED,
            bufferArgument: UNSUPPORTED,

            afterClose: "ERR_FFI_LIBRARY_CLOSED",
        });
    });
});
