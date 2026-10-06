import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix, win32 } from "node:path";

import { componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { describe, expect, test, vi } from "vitest";

import { bundleComponentSource } from "../../src/bundle.js";
import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { COMPONENT_JS_FIXTURES_DIR, hasJspi } from "../common.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";

// Resolve the workspace's package export: the installed release predates the P3 alias.
const stdRequire = createRequire(new URL("../../../jco-std/package.json", import.meta.url));
const pathFactory = stdRequire.resolve("@bytecodealliance/jco-std/wasi/0.3.x/node/24.x.x/path");
const fixture = join(COMPONENT_JS_FIXTURES_DIR, "node-path-p3");

test("the P3 path export resolves to the existing Node 24 implementation", () => {
    expect(pathFactory).toBe(stdRequire.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path"));
});

describe.skipIf(!hasJspi)("node:path in a QuickJS P3 component", () => {
    test("uses P3 environment providers with the shared Node 24 path implementation", async () => {
        const directory = await getTmpDir();
        let cleanup;
        try {
            const witPath = join(fixture, "wit");
            const onWitRequirement = vi.fn();
            const source = await bundleComponentSource(join(fixture, "component.js"), {
                plugins: [nodeBuiltinPlugin(await worldMetadataFor(witPath), { pathFactory, onWitRequirement })],
            });
            expect(onWitRequirement).not.toHaveBeenCalled();
            expect(source).toContain("wasi:cli/environment@0.3.0");
            expect(source).not.toMatch(/wasi:cli\/environment@0\.2\.|jco:node\//);
            const entry = join(directory, "component.js");
            const componentPath = join(directory, "component.wasm");
            await writeFile(entry, source);
            await exec(jcoPath, "componentize", entry, "--backend", "qjs", "-w", witPath, "-o", componentPath, {
                closeStdin: true,
            });
            const wit = await componentWit(await readFile(componentPath));
            expect(wit).toMatch(/import wasi:cli\/environment@0\.3\.0/);
            expect(wit).toMatch(/export from-cwd: async func/);

            let cwd = "/workspace/p3";
            const getInitialCwd = vi.fn(() => cwd);
            const getEnvironment = vi.fn(() => [["=c:", "C:\\users\\p3"]]);
            const imports = {
                ...new WASIShim().getImportObject(),
                "path-environment": {
                    getInitialCwd,
                    getEnvironment,
                    getArguments: () => [],
                },
            };
            const component = await setupAsyncTest({
                asyncMode: "jspi",
                component: { name: "node-path-p3", path: componentPath, imports, outputDir: directory },
                // QuickJS also imports P2 WASI for its engine. Give the guest's P3 environment
                // a distinct import key so the versionless P2 shim cannot satisfy it by accident.
                jco: { transpile: { extraArgs: { map: { "wasi:cli/environment@0.3.0": "path-environment" } } } },
            });
            cleanup = component.cleanup;
            const { instance } = component;
            expect(await instance.identities()).toBe(true);
            expect(await instance.lexical()).toBe("a/c|C:\\a\\b|\\|true");
            expect(getInitialCwd).not.toHaveBeenCalled();
            expect(getEnvironment).not.toHaveBeenCalled();

            expect(await instance.fromCwd()).toBe("/workspace/p3/relative");
            expect(getInitialCwd).toHaveBeenCalledOnce();
            expect(await instance.fromDrive()).toBe("C:\\users\\p3\\relative");
            expect(getEnvironment).toHaveBeenCalledOnce();

            for (const windows of [false, true]) {
                const native = windows ? win32 : posix;
                for (const [value, pattern] of [
                    ["src/component.ts", "**/*.{js,ts}"],
                    ["src/component.md", "**/*.{js,ts}"],
                    ["file2.js", "file{1..3}.js"],
                    ["literal[1].js", "literal[[]1].js"],
                    ["src\\component.ts", "src\\*.{js,ts}"],
                ]) {
                    expect(await instance.match(value, pattern, windows)).toBe(native.matchesGlob(value, pattern));
                }
            }

            cwd = undefined;
            expect(await instance.missingCwd()).toContain("node:path requires wasi:cli/environment");
        } finally {
            await cleanup?.();
            await rm(directory, { recursive: true, force: true });
        }
    }, 600_000);
});
