/* global Buffer */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { suite, test, assert, expect } from "vitest";
import { componentize } from "../src/cmd/componentize.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "./helpers.js";

// NOTE: we test componentization with the jco CLI to avoid
// triggering errors for the the eval(import) call(s) in cmd/componentize.js
//
// TODO(breaking): once jco-transpile is established as a separate package and
// used widely, we can switch to regular dynamic imports, as componentize-js
// versions are real dependencies now.
suite("componentize", () => {
    test("componentized exported resource invokes its guest destructor", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "resource-disposal",
            entry: "source.js",
            wit: "source.wit",
            extraArgs: ["--disable", "all"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "resource-disposal", path: componentPath },
        });

        try {
            const resource = new instance.resources.Example(42);
            assert.strictEqual(resource.getId(), 42);
            resource[Symbol.dispose || Symbol.for("dispose")]();
            assert.strictEqual(instance.resources.disposeCount(), 1);
        } finally {
            await cleanup();
        }
    });

    test("rejects a custom StarlingMonkey engine with the QuickJS backend", async () => {
        await expect(
            componentizeFixture({
                fixture: "typescript-direct",
                entry: "source.ts",
                wit: "source.wit",
                extraArgs: ["--backend", "qjs", "--engine", "custom-engine.wasm"],
            }),
        ).rejects.toThrow();

        await expect(
            componentize("unused.js", {
                backend: "quickjs",
                engine: "custom-engine.wasm",
                wit: "unused.wit",
                out: "unused.wasm",
            }),
        ).rejects.toThrow(/--engine option is only supported by the starlingmonkey backend/);
    });

    test.concurrent("detect older wasi:http", async () => {
        const { stderr } = await componentizeFixture({ fixture: "wasi-http-detection-old" });
        assert.match(
            stderr,
            /Falling back to componentize-js 0\.19\.3 because this component requests Preview 2 WASI packages older than 0\.2\.10\./,
        );
        assert.match(
            stderr,
            /https:\/\/bytecodealliance\.github\.io\/jco\/troubleshooting\/common-issues\.html#componentize-js-0193-fallback/,
        );
    });

    test.concurrent("detect newer wasi:http", async () => {
        const { stderr } = await componentizeFixture({ fixture: "wasi-http-detection-new" });
        assert.strictEqual(stderr, "");
    });

    test("uses the non-bundled compatibility path by default", async () => {
        const { stderr } = await componentizeFixture({
            fixture: "simple-resource",
            entry: "source.js",
            wit: "source.wit",
        });

        assert.strictEqual(stderr, "");
    });

    test("requires bundling when a bundle config is provided", async () => {
        const outputDir = await getTmpDir();

        await expect(
            componentizeFixture({
                fixture: "simple-resource",
                entry: "source.js",
                wit: "source.wit",
                outputDir,
                extraArgs: ["--bundle-config", join(outputDir, "rolldown.config.mjs")],
            }),
        ).rejects.toThrow(/--bundle-config requires --bundle/);
    });

    test("componentizes a TypeScript entry without an explicit bundle flag", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "typescript-direct",
            entry: "source.ts",
            wit: "source.wit",
        });
        const component = await readFile(componentPath);

        assert.strictEqual(stderr, "");
        assert.deepEqual([...component.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d]);
    });

    test("componentizes with the QuickJS backend alias", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "typescript-direct",
            entry: "source.ts",
            wit: "source.wit",
            extraArgs: ["--backend", "qjs"],
        });
        const component = await readFile(componentPath);

        assert.strictEqual(stderr, "");
        assert.deepEqual([...component.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d]);

        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "quickjs", path: componentPath },
        });
        try {
            assert.strictEqual(instance.hello("world"), "hello, world");
        } finally {
            await cleanup();
        }
    });

    test("rejects TypeScript declarations as component entries", async () => {
        await expect(
            componentizeFixture({
                fixture: "typescript-direct",
                entry: "declaration.d.ts",
                wit: "source.wit",
            }),
        ).rejects.toThrow(/TypeScript declaration files cannot be componentized directly/);
    });

    test("bundles and executes a local dependency graph", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "local-dependency",
            entry: "source.js",
            wit: "source.wit",
            bundle: true,
            extraArgs: ["--backend", "qjs"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "local-dependency", path: componentPath },
        });

        try {
            assert.strictEqual(instance.hello(), "world from a dependency");
        } finally {
            await cleanup();
        }
    });

    test("bundles and executes Node assert APIs guest-side", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-assert",
            entry: "source.js",
            wit: "source.wit",
            bundle: true,
            extraArgs: ["--backend", "qjs"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-assert", path: componentPath },
        });

        try {
            assert.deepEqual(instance.run(), {
                scalarChecks: 19,
                deepChecks: 14,
                matcherChecks: 12,
                moduleChecks: 7,
                promiseChecks: 2,
                deprecatedChecks: 2,
                failureCode: "ERR_ASSERTION",
                failureOperator: "strictEqual",
                strictSubpath: true,
                deprecatedCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            });
        } finally {
            await cleanup();
        }
    });

    test("bundles and executes unenv Node querystring APIs guest-side", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-querystring",
            entry: "source.js",
            wit: "source.wit",
            bundle: true,
            extraArgs: ["--backend", "qjs"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-querystring", path: componentPath },
        });

        try {
            assert.deepEqual(instance.run(), {
                repeated: ["one", "two words"],
                empty: "",
                flag: "",
                malformedFallback: true,
                customFirst: "one",
                customSecond: "two words",
                limitedKeys: 2,
                encoded: "value=one&value=two%20words&empty=&enabled=true&nil=",
                customEncoded: "[first]:[one];[second]:[two words]",
                escaped: "a%20b%2Bc%2F%E2%9C%93",
                unescaped: "a+b+c/✓",
                bufferBytes: new Uint8Array([65, 32, 66]),
                nullPrototype: true,
                namespaceChecks: 4,
            });
        } finally {
            await cleanup();
        }
    });

    test("bundles and executes unenv Node buffer APIs guest-side", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-buffer",
            entry: "source.js",
            wit: "source.wit",
            bundle: true,
            extraArgs: ["--backend", "qjs"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-buffer", path: componentPath },
        });

        try {
            assert.deepEqual(instance.run(), {
                text: "component ✓",
                hex: "636f6d706f6e656e7420e29c93",
                base64: "Y29tcG9uZW50IOKckw==",
                byteLength: 13,
                combined: "onetwo",
                numericBytes: new Uint8Array([239, 205, 171, 137, 255, 237, 41, 121, 219, 15, 73, 64]),
                swappedBytes: new Uint8Array([17, 0, 51, 34]),
                searchIndex: 3,
                moduleIdentity: true,
                instanceIdentity: true,
                callCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
                constructCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
                slowCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            });
        } finally {
            await cleanup();
        }
    });
});
