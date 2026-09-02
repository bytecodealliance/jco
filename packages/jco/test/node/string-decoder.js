// End-to-end coverage for `node:string_decoder` in a StarlingMonkey component.
import assert from "node:assert/strict";

import { suite, test } from "vitest";

import { componentizeFixture, transpileComponent } from "../helpers.js";

suite("node:string_decoder in a component", () => {
    // TODO(unskip): jco pins a versioned jco-std string-decoder export that is not published yet.
    // Enable this after a jco-std release containing the entry point is available to jco.
    test.skip("componentizes idiomatic streaming decoders and matches Node", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-string-decoder",
            entry: "source.js",
            wit: "source.wit",
            world: "test",
            bundle: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });
        assert.strictEqual(stderr, "");

        const { modulePath } = await transpileComponent({ componentPath, name: "node-string-decoder" });
        const component = await import(modulePath);
        assert.deepEqual(JSON.parse(component.run()), {
            decoded: "A🌍",
            encoded: "-_8",
            moduleIdentity: true,
        });
    });
});
