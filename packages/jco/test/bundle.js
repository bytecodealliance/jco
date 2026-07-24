import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { bundleComponentSource, classifyComponentSource, loadBundleConfig } from "../src/bundle.js";
import { getTmpDir } from "./helpers.js";

async function writeFixture(files) {
    const dir = await getTmpDir();
    await Promise.all(
        Object.entries(files).map(async ([name, contents]) => {
            const path = join(dir, name);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, contents);
        }),
    );
    return dir;
}

suite("component source bundling", () => {
    test("classifies TypeScript component entry points", () => {
        for (const source of ["component.ts", "component.mts", "component.cts", "component.tsx"]) {
            assert.strictEqual(classifyComponentSource(source), "typescript");
        }
        for (const source of ["component.d.ts", "component.d.mts", "component.d.cts", "component.d.tsx"]) {
            assert.strictEqual(classifyComponentSource(source), "typescript-declaration");
        }
        for (const source of ["component.js", "component.mjs", "component.cjs", "component"]) {
            assert.strictEqual(classifyComponentSource(source), "javascript");
        }
    });

    test("loads object and function configuration modules with Rolldown", async () => {
        const dir = await writeFixture({
            "object.mjs": "export default { minify: true };",
            "function.mjs": "export default ({ bundle }) => ({ minify: bundle });",
            "array.mjs": "export default [{}, {}];",
        });

        await expect(loadBundleConfig(join(dir, "object.mjs"))).resolves.toMatchObject({ minify: true });
        await expect(loadBundleConfig(join(dir, "function.mjs"))).resolves.toMatchObject({ minify: true });
        await expect(loadBundleConfig(join(dir, "array.mjs"))).rejects.toThrow(/single configuration object/);
    });

    test("bundles a local dependency graph into one ES module", async () => {
        const dir = await writeFixture({
            "entry.js": 'import { value } from "./value.js"; export const result = value + 1;',
            "value.js": "export const value = 41;",
        });

        const source = await bundleComponentSource(join(dir, "entry.js"));

        assert.match(source, /const result = 42/);
        expect(source).not.toMatch(/\.\/value\.js/);
        assert.match(source, /result/);
    });

    test("transforms and bundles a TypeScript dependency graph", async () => {
        const dir = await writeFixture({
            "entry.ts": [
                'import { message } from "./message.ts";',
                'import type { ComponentMessage } from "./types.ts";',
                "const result: ComponentMessage = { text: message };",
                "const configured: number = __TS_VALUE__;",
                "export function hello(name: string): string {",
                "  return `${result.text}, ${name} #${configured}`;",
                "}",
            ].join("\n"),
            "message.ts": 'export const message: string = "hello";',
            "types.ts": "export interface ComponentMessage { text: string }",
        });

        const source = await bundleComponentSource(join(dir, "entry.ts"), {
            typescript: true,
            config: { transform: { define: { __TS_VALUE__: "42" } } },
        });

        assert.match(source, /function hello\(name\)/);
        assert.match(source, /hello/);
        assert.match(source, /configured = 42/);
        expect(source).not.toMatch(/ComponentMessage|interface|:\s*string/);
        expect(source).not.toMatch(/\.\/(?:message|types)\.ts/);
    });

    test("bundles TypeScript dependencies imported by a JavaScript entry", async () => {
        const dir = await writeFixture({
            "entry.js": 'import { answer } from "./answer.ts"; export const result = answer;',
            "answer.ts": "export const answer: number = 42;",
        });

        const source = await bundleComponentSource(join(dir, "entry.js"));

        assert.match(source, /result = 42/);
        expect(source).not.toMatch(/:\s*number|\.\/answer\.ts/);
    });

    test("uses the entry project's tsconfig for TypeScript resolution", async () => {
        const dir = await writeFixture({
            "entry.ts": 'import { answer } from "#lib/answer"; export const result: number = answer;',
            "src/answer.ts": "export const answer: number = 42;",
            "tsconfig.json": JSON.stringify({
                compilerOptions: {
                    baseUrl: ".",
                    paths: { "#lib/*": ["src/*"] },
                },
            }),
        });

        const source = await bundleComponentSource(join(dir, "entry.ts"), { typescript: true });

        assert.match(source, /result = 42/);
        expect(source).not.toMatch(/#lib\/answer/);
    });

    test("resolves npm packages from the entry project", async () => {
        const dir = await writeFixture({
            "entry.js": 'import { answer } from "fixture-package"; export const result = answer;',
            "node_modules/fixture-package/package.json": JSON.stringify({
                name: "fixture-package",
                type: "module",
                exports: "./index.js",
            }),
            "node_modules/fixture-package/index.js": "export const answer = 42;",
        });

        const source = await bundleComponentSource(join(dir, "entry.js"));

        assert.match(source, /const result = 42/);
        expect(source).not.toMatch(/fixture-package/);
    });

    test("preserves wasi imports as component capabilities", async () => {
        const dir = await writeFixture({
            "entry.js": 'import { getEnvironment } from "wasi:cli/environment@0.2.6"; export { getEnvironment };',
        });

        const source = await bundleComponentSource(join(dir, "entry.js"));

        assert.match(source, /from\s+["']wasi:cli\/environment@0\.2\.6["']/);
    });

    test("supports aliases and virtual-module plugins", async () => {
        const dir = await writeFixture({
            "entry.js":
                'import { aliasValue } from "jco:adapter"; import { virtualValue } from "jco:virtual"; export const value = aliasValue + virtualValue;',
            "adapter.js": "export const aliasValue = 20;",
        });
        const virtualId = "\0jco-adapter";
        const source = await bundleComponentSource(join(dir, "entry.js"), {
            aliases: { "jco:adapter": join(dir, "adapter.js") },
            plugins: [
                {
                    name: "virtual-adapter",
                    resolveId(id) {
                        if (id === "jco:virtual") {
                            return virtualId;
                        }
                    },
                    load(id) {
                        if (id === virtualId) {
                            return "export const virtualValue = 22;";
                        }
                    },
                },
            ],
        });

        assert.match(source, /value = 42/);
    });

    test("merges user Rolldown input and output configuration", async () => {
        const dir = await writeFixture({
            "entry.js": 'import { value } from "configured"; export const result = value;',
            "configured.js": "export const value = 42;",
            "ignored.js": "export const ignored = true;",
        });
        const source = await bundleComponentSource(join(dir, "entry.js"), {
            config: {
                input: join(dir, "ignored.js"),
                resolve: { alias: { configured: join(dir, "configured.js") } },
                plugins: [{ name: "configured-plugin", transform: (code) => code.replace("42", "43") }],
                output: { banner: "/* configured bundle */", format: "cjs", codeSplitting: true },
            },
        });

        assert.match(source, /^\/\* configured bundle \*\//);
        assert.match(source, /result = 43/);
        expect(source).not.toMatch(/ignored/);
        expect(source).not.toMatch(/module\.exports/);
    });

    test("rejects multiple configured outputs", async () => {
        const dir = await writeFixture({ "entry.js": "export const value = 42;" });
        await expect(
            bundleComponentSource(join(dir, "entry.js"), { config: { output: [{ format: "esm" }] } }),
        ).rejects.toThrow(/at most one output/);
    });

    test("rejects emitted assets", async () => {
        const dir = await writeFixture({ "entry.js": "export const value = 42;" });

        await expect(
            bundleComponentSource(join(dir, "entry.js"), {
                plugins: [
                    {
                        name: "asset-emitter",
                        buildStart() {
                            this.emitFile({ type: "asset", name: "extra.txt", source: "extra" });
                        },
                    },
                ],
            }),
        ).rejects.toThrow(/unsupported assets: assets\/extra-[A-Za-z0-9_-]+\.txt/);
    });

    test("preserves syntax and resolution diagnostics", async () => {
        const syntaxDir = await writeFixture({ "syntax-error.js": "export const = 42;" });
        const resolutionDir = await writeFixture({
            "unresolved.js": 'import "./missing.js"; export const value = 42;',
        });

        await expect(bundleComponentSource(join(syntaxDir, "syntax-error.js"))).rejects.toThrow(/syntax-error\.js/);
        await expect(bundleComponentSource(join(resolutionDir, "unresolved.js"))).rejects.toThrow(/missing\.js/);
    });

    test("preserves TypeScript syntax diagnostics", async () => {
        const dir = await writeFixture({ "syntax-error.ts": "export const value: = 42;" });

        await expect(bundleComponentSource(join(dir, "syntax-error.ts"), { typescript: true })).rejects.toThrow(
            /syntax-error\.ts/,
        );
    });

    test("preserves plugin failure diagnostics", async () => {
        const dir = await writeFixture({ "entry.js": "export const value = 42;" });

        await expect(
            bundleComponentSource(join(dir, "entry.js"), {
                plugins: [{ name: "failing-plugin", buildStart: () => Promise.reject(new Error("plugin exploded")) }],
            }),
        ).rejects.toThrow(/plugin exploded/);
    });
});
