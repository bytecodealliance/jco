import assert from "node:assert/strict";
import nodeModule from "node:module";

import { suite, test } from "vitest";

import { componentizeFixture, transpileComponent } from "../helpers.js";

const UNSUPPORTED = "ERR_JCO_UNSUPPORTED_NODE_API";

suite("node:module in a component", () => {
    // TODO(unskip): use the published jco-std node/24.x.x module export once a release contains it.
    test.skip("componentizes, computes what it can, and refuses the loading half", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-module",
            entry: "source.js",
            wit: "source.wit",
            world: "test",
            bundle: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });

        const { modulePath } = await transpileComponent({ componentPath, name: "node-module" });

        const component = await import(modulePath);
        const result = JSON.parse(component.run());

        // Classification and source-map arithmetic are held to the host's real `node:module`, not
        // to values written down here, so a divergence shows up as a failure rather than as drift.
        assert.equal(result.moduleIsClass, nodeModule === nodeModule.Module);
        assert.equal(result.builtinCount, nodeModule.builtinModules.length);
        assert.equal(result.isBuiltinFs, nodeModule.isBuiltin("node:fs"));
        assert.equal(result.isBuiltinBareTest, nodeModule.isBuiltin("test"));
        assert.equal(result.isBuiltinPrefixedTest, nodeModule.isBuiltin("node:test"));
        assert.equal(result.wrapped, nodeModule.wrap("const a = 1;"));
        // Spread: JSON cannot carry Node's null prototype, which jco-std's unit tests check directly.
        assert.deepEqual(result.sourceMapsSupport, { ...nodeModule.getSourceMapsSupport() });

        const payload = {
            version: 3,
            file: "out.js",
            sources: ["a.ts", "b.ts"],
            names: ["alpha", "beta"],
            mappings: "AAAA,SAASA;AACT,ICAAC",
        };
        const map = new nodeModule.SourceMap(payload);
        assert.deepEqual(result.entry, map.findEntry(0, 10));
        assert.deepEqual(result.origin, map.findOrigin(2, 5));

        // `require` is created successfully and resolves builtins exactly as Node does.
        assert.equal(result.resolvesBuiltin, nodeModule.createRequire("/app/index.js").resolve("node:path"));
        assert.equal(result.resolveMissing, "MODULE_NOT_FOUND");

        // The documented divergences: a component has no compile cache and no global module dirs.
        assert.equal(result.compileCacheStatus, nodeModule.constants.compileCacheStatus.FAILED);
        assert.deepEqual(result.globalPaths, []);

        // Everything that needs a loader refuses, rather than failing later or silently no-oping.
        assert.deepEqual(
            {
                requiring: result.requiring,
                register: result.register,
                runMain: result.runMain,
                stripTypes: result.stripTypes,
                moduleRequire: result.moduleRequire,
            },
            {
                requiring: UNSUPPORTED,
                register: UNSUPPORTED,
                runMain: UNSUPPORTED,
                stripTypes: UNSUPPORTED,
                moduleRequire: UNSUPPORTED,
            },
        );
    });
});
