import { expect, suite, test } from "vitest";

import { componentizeFixture, setupAsyncTest } from "../helpers.js";

const EXPECTED_REPORT = {
    consumedText: "A€!",
    consumedJson: 24,
    consumedBuffer: "buffer",
    syncText: "sync!",
    protocolText: "protocol",
    sourceBytes: "iter!",
    arrayChunks: 2,
    transformed: "COMPONENT!",
    tapped: "1,0",
    written: "piped",
    writtenBytes: 5,
    pushed: "push",
    broadcast: ["broadcast", "broadcast"],
    shared: ["share", "share"],
    classStatics: true,
    unsupportedCode: "ERR_JCO_UNSUPPORTED_NODE_API",
};

suite("Node stream modules", () => {
    // TODO(unskip): use the published jco-std stream modules once a release containing them is available.
    test.skip("bundles both stream APIs and executes them in a StarlingMonkey guest", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-stream",
            entry: "source.js",
            wit: "source.wit",
            bundle: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-stream", path: componentPath },
        });

        try {
            expect(JSON.parse(await instance.run())).toEqual(EXPECTED_REPORT);
        } finally {
            await cleanup();
        }
    }, 600_000);
});
