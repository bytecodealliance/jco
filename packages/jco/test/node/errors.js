import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { bundleComponentSource } from "../../src/bundle.js";
import { nodeErrorGlobals } from "../../src/node-builtins.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

suite("Node Errors globals", () => {
    test("maps the complete Node 24 error global set", () => {
        expect(Object.keys(nodeErrorGlobals({ errorsModule: "/errors.js" })).sort()).toEqual([
            "AggregateError",
            "DOMException",
            "Error",
            "EvalError",
            "RangeError",
            "ReferenceError",
            "SuppressedError",
            "SyntaxError",
            "TypeError",
            "URIError",
        ]);
    });

    test("injects a referenced error constructor", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const errors = join(root, "errors.js");
        await writeFile(entry, 'export const message = new Error("boom").message;');
        await writeFile(errors, "globalThis.__ERROR_SHIM_MARKER__ = true; export const Error = globalThis.Error;");

        const source = await bundleComponentSource(entry, {
            inject: nodeErrorGlobals({ errorsModule: errors }),
        });

        assert.include(source, "__ERROR_SHIM_MARKER__");
        assert.include(source, "new Error");
    });

    test("omits the errors shim when no injected builtin is used", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const errors = join(root, "errors.js");
        await writeFile(entry, "class Error {} export const message = new Error().constructor.name;");
        await writeFile(errors, "globalThis.__ERROR_SHIM_MARKER__ = true; export const Error = globalThis.Error;");

        const source = await bundleComponentSource(entry, {
            inject: nodeErrorGlobals({ errorsModule: errors }),
        });

        expect(source).not.toContain("__ERROR_SHIM_MARKER__");
        expect(source).not.toContain(errors);
        assert.include(source, "Error = class");
    });

    test("keeps explicit bundle injection overrides", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const defaults = join(root, "default-errors.js");
        const override = join(root, "override-errors.js");
        await writeFile(entry, 'export const message = new Error("boom").message;');
        await writeFile(defaults, "export const Error = class DefaultError {};");
        await writeFile(
            override,
            "globalThis.__OVERRIDE_ERROR_MARKER__ = true; export const Error = globalThis.Error;",
        );

        const source = await bundleComponentSource(entry, {
            inject: nodeErrorGlobals({ errorsModule: defaults }),
            config: { transform: { inject: { Error: [override, "Error"] } } },
        });

        assert.include(source, "__OVERRIDE_ERROR_MARKER__");
        expect(source).not.toContain("DefaultError");
    });

    // TODO(unskip): use the published jco-std Errors globals once a release containing them is available.
    test.skip("provides Node error globals to a StarlingMonkey guest", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-errors",
            bundle: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-errors", path: componentPath },
        });

        try {
            expect(instance.run()).toEqual({
                message: "outer",
                causeMessage: "cause",
                aggregateCount: 2,
                suppressedMessage: "suppressed",
                isError: true,
                capturedStack: true,
            });
        } finally {
            await cleanup();
        }
    }, 600_000);
});
