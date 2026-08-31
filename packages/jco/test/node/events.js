import assert from "node:assert/strict";

import { suite, test } from "vitest";

import { componentizeFixture, transpileComponent } from "../helpers.js";

/**
 * What the fixture produces when run on the host's real `node:events`.
 *
 * Captured from Node 24 rather than written by hand, so the component is held to Node's behavior
 * and not to an expectation that could drift from it.
 */
const NODE_RESULT = {
    seen: ["first", 1, "once"],
    listenerCount: 2,
    staticListenerCount: 2,
    eventNames: ["x"],
    getEventListeners: 2,
    maxOnTarget: 4,
    maxOnEmitter: 7,
    defaultApplied: 3,
    badTarget: "ERR_INVALID_ARG_TYPE",
    badRange: "ERR_OUT_OF_RANGE",
    moduleIsClass: true,
    staticOnce: "function",
    errored: "threw",
};

suite("node:events in a component", () => {
    // TODO(unskip): use the published jco-std events export once a release containing it is available.
    test.skip("componentizes and matches Node", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-events",
            entry: "source.js",
            wit: "source.wit",
            world: "test",
            bundle: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });

        const { modulePath } = await transpileComponent({ componentPath, name: "node-events" });

        const component = await import(modulePath);
        assert.deepEqual(JSON.parse(component.run()), NODE_RESULT);
    });
});
