import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin, nodeGlobals } from "../../src/node-builtins.js";
import { getTmpDir } from "../helpers.js";

async function writeInjectionModules(root) {
    const errors = join(root, "errors.js");
    const buffer = join(root, "buffer.js");
    await writeFile(
        errors,
        [
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
        ]
            .map((name) => `export const ${name} = globalThis.${name};`)
            .join("\n"),
    );
    await writeFile(
        buffer,
        "globalThis.__BUFFER_GLOBAL_MARKER__ = true; export class Buffer { static from(value) { return { toString: () => value }; } }",
    );
    return { buffer, errors };
}

suite("Node globals", () => {
    test("does not invent a globals builtin module", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] });

        expect(plugin.resolveId("node:globals")).toBeNull();
        expect(plugin.resolveId("globals")).toBeNull();
    });

    test("maps only globals backed by Jco implementations", () => {
        expect(nodeGlobals({ bufferModule: "/buffer.js", errorsModule: "/errors.js" })).toEqual({
            AggregateError: ["/errors.js", "AggregateError"],
            Buffer: ["/buffer.js", "Buffer"],
            DOMException: ["/errors.js", "DOMException"],
            Error: ["/errors.js", "Error"],
            EvalError: ["/errors.js", "EvalError"],
            RangeError: ["/errors.js", "RangeError"],
            ReferenceError: ["/errors.js", "ReferenceError"],
            SuppressedError: ["/errors.js", "SuppressedError"],
            SyntaxError: ["/errors.js", "SyntaxError"],
            TypeError: ["/errors.js", "TypeError"],
            URIError: ["/errors.js", "URIError"],
        });
    });

    test("injects Buffer when its free identifier is used", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const modules = await writeInjectionModules(root);
        await writeFile(entry, 'export const value = Buffer.from("value").toString();');

        const source = await bundleComponentSource(entry, {
            inject: nodeGlobals({ bufferModule: modules.buffer, errorsModule: modules.errors }),
        });

        assert.include(source, "__BUFFER_GLOBAL_MARKER__");
    });

    test("routes the Buffer global through the audited Node builtin adapter", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const modules = await writeInjectionModules(root);
        await writeFile(entry, 'export const value = Buffer.from("value").toString();');

        const source = await bundleComponentSource(entry, {
            inject: nodeGlobals({ errorsModule: modules.errors }),
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] })],
        });

        assert.include(source, "deprecated Buffer() constructor");
        assert.include(source, "globalThis.Buffer = Buffer");
    });

    test("omits the Buffer adapter when its global is unused or shadowed", async () => {
        const root = await getTmpDir();
        const modules = await writeInjectionModules(root);
        const unusedEntry = join(root, "unused.js");
        const shadowedEntry = join(root, "shadowed.js");
        await writeFile(unusedEntry, "export const value = 24;");
        await writeFile(shadowedEntry, "class Buffer {} export const value = new Buffer().constructor.name;");

        for (const entry of [unusedEntry, shadowedEntry]) {
            const source = await bundleComponentSource(entry, {
                inject: nodeGlobals({ bufferModule: modules.buffer, errorsModule: modules.errors }),
            });
            expect(source).not.toContain("__BUFFER_GLOBAL_MARKER__");
            expect(source).not.toContain(modules.buffer);
        }
    });

    test("keeps an explicit bundle injection override", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const modules = await writeInjectionModules(root);
        const override = join(root, "override.js");
        await writeFile(entry, 'export const value = Buffer.from("value").toString();');
        await writeFile(
            override,
            "globalThis.__BUFFER_OVERRIDE_MARKER__ = true; export class Buffer { static from(value) { return { toString: () => value }; } }",
        );

        const source = await bundleComponentSource(entry, {
            inject: nodeGlobals({ bufferModule: modules.buffer, errorsModule: modules.errors }),
            config: { transform: { inject: { Buffer: [override, "Buffer"] } } },
        });

        assert.include(source, "__BUFFER_OVERRIDE_MARKER__");
        expect(source).not.toContain("__BUFFER_GLOBAL_MARKER__");
    });
});
