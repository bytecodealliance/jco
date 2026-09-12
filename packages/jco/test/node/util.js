import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, expect, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { bundleComponentSource } from "../../src/bundle.js";
import { exec, getTmpDir, jcoPath, transpileComponent } from "../helpers.js";
import { hasJspi } from "../common.js";
import native from "node:util";

const fixture = new URL("../fixtures/componentize/node-util/", import.meta.url);

const std = (path) => fileURLToPath(new URL(`../../../jco-std/dist/wasi/0.2.x/node/24.x.x/${path}`, import.meta.url));

const overrides = { utilModule: std("util/index.js"), utilTypesModule: std("util-types.js") };

test("util adapters resolve lazily without WIT capabilities", async () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ...overrides, onWitRequirement });
    for (const name of ["node:util", "node:util/types"]) {
        expect(plugin.resolveId(name)).toBe(`\0jco-node-builtin:${name}`);
    }
    for (const name of ["util", "util/types"]) {
        expect(await plugin.resolveId.call({ resolve: async () => null }, name)).toBe(
            `\0jco-node-builtin:node:${name}`,
        );
        expect(
            await plugin.resolveId.call({ resolve: async () => ({ id: `/installed/${name}.js` }) }, name),
        ).toBeNull();
    }
    expect(plugin.resolveId("node:util/unknown")).toBeNull();
    expect(onWitRequirement).not.toHaveBeenCalled();
});

test.skipIf(!hasJspi).each(["quickjs", "starlingmonkey"])(
    "runs util algorithms and namespaces in %s",
    async (backend) => {
        const dir = await getTmpDir();
        const entry = join(dir, "source.js");
        const componentPath = join(dir, "component.wasm");
        const source = await bundleComponentSource(fileURLToPath(new URL("source.js", fixture)), {
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, overrides)],
        });
        await writeFile(entry, source);
        await exec(
            jcoPath,
            "componentize",
            entry,
            "--backend",
            backend,
            "-w",
            fileURLToPath(new URL("source.wit", fixture)),
            "-n",
            "test",
            "-o",
            componentPath,
            { closeStdin: true },
        );
        const { modulePath } = await transpileComponent({ componentPath, name: "util" });
        const component = await import(modulePath);
        const report = JSON.parse(component.run());
        assert.equal(report.identity, true);
        assert.deepEqual(
            report.exports,
            [
                "MIMEParams",
                "MIMEType",
                "TextDecoder",
                "TextEncoder",
                "_errnoException",
                "_exceptionWithHostPort",
                "_extend",
                "aborted",
                "callbackify",
                "convertProcessSignalToExitCode",
                "debug",
                "debuglog",
                "deprecate",
                "diff",
                "format",
                "formatWithOptions",
                "getCallSites",
                "getSystemErrorMap",
                "getSystemErrorMessage",
                "getSystemErrorName",
                "inherits",
                "inspect",
                "isArray",
                "isDeepStrictEqual",
                "parseArgs",
                "parseEnv",
                "promisify",
                "setTraceSigInt",
                "stripVTControlCharacters",
                "styleText",
                "toUSVString",
                "transferableAbortController",
                "transferableAbortSignal",
                "types",
            ].sort(),
        );
        assert.equal(report.answer, 42);
        assert.deepEqual(report.callback, [null, "callback"]);
        assert.deepEqual(report.mime, [
            "text/html",
            [
                ["charset", "utf-8"],
                ["title", "a;b"],
                ["x", "y"],
            ],
            'text/html;charset=utf-8;title="a;b";x=y',
            'empty=""',
        ]);
        const config = {
            args: ["-vv", "--name=guest", "--no-color", "tail"],
            options: {
                verbose: { type: "boolean", short: "v", multiple: true },
                name: { type: "string" },
                color: { type: "boolean", default: true },
            },
            allowNegative: true,
            allowPositionals: true,
            tokens: true,
        };
        assert.deepEqual(report.args, JSON.parse(JSON.stringify(native.parseArgs(config))));
        assert.deepEqual(report.env, { FOO: "bar", GREETING: "hello\nworld" });
        assert.deepEqual(report.diff, [
            [0, "a"],
            [1, "b"],
            [-1, "d"],
            [0, "c"],
        ]);
        assert.equal(report.formatted, 'ok 3 {"x":1}');
        assert.equal(report.options, "{ a: 2, z: 1 }");
        assert.deepEqual(report.inspected, ["<ref *1> { self: [Circular *1] }", "{ x: [Getter] }", "{ custom: true }"]);
        assert.equal(report.styled, native.styleText(["bold", "red"], "hello", { validateStream: false }));
        assert.equal(report.stripped, "red");
        assert.equal(report.unicode, "�x🌍");
        assert.deepEqual(report.encoded, backend === "quickjs" ? "ERR_JCO_UNSUPPORTED_NODE_API" : [240, 159, 140, 141]);
        assert.equal(report.decoded, backend === "quickjs" ? "ERR_JCO_UNSUPPORTED_NODE_API" : "🌍");
        assert.equal(report.equal, true);
        assert.equal(report.inherited, true);
        assert.deepEqual(report.brands, [true, true, true, false, true, true, true, true]);
        assert.equal(Object.keys(report.refusals).length, 14);
        for (const [name, code] of Object.entries(report.refusals)) {
            assert.equal(
                code,
                name.startsWith("_") || name === "isArray"
                    ? "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API"
                    : "ERR_JCO_UNSUPPORTED_NODE_API",
            );
        }
    },
    600_000,
);
