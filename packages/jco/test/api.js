import { fileURLToPath } from "node:url";
import { platform } from "node:process";
import { readFile } from "node:fs/promises";

import { suite, test, assert, beforeAll } from "vitest";

import {
    transpile,
    types,
    opt,
    print,
    parse,
    componentNew,
    componentEmbed,
    metadataShow,
    preview1AdapterReactorPath,
} from "../src/api.js";

import { readComponentBytes, getCurrentWitComponentVersion } from "./helpers.js";

const isWindows = platform === "win32";

// - (2025/02/04) increased due to incoming implementations of async and new flush impl
// - (2025/08/07) increased due to async task implementations, refactors
// - (2025/12/16) increased due to more async task impl
const FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT = 100_000;

suite("API", () => {
    let flavorfulWasmBytes;
    let exitCodeWasmBytes;

    beforeAll(async () => {
        const bytes = await Promise.all([
            readComponentBytes(`test/fixtures/components/flavorful.component.wasm`),
            readComponentBytes(`test/fixtures/modules/exitcode.wasm`),
        ]);
        flavorfulWasmBytes = bytes[0];
        exitCodeWasmBytes = bytes[1];
    });

    test("Transpile", async () => {
        const name = "flavorful";
        const { files, imports, exports } = await transpile(flavorfulWasmBytes, {
            name,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ["test", "instance"]);
        assert.ok(files[name + ".js"]);
    });

    test("Transpile to JS", async () => {
        const name = "flavorful";
        const { files, imports, exports } = await transpile(flavorfulWasmBytes, {
            map: {
                "test:flavorful/*": "./*.js",
            },
            name,
            validLiftingOptimization: true,
            tlaCompat: true,
            base64Cutoff: 0,
            js: true,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ["test", "instance"]);
        assert.deepStrictEqual(exports[1], ["test:flavorful/test", "instance"]);
        assert.deepStrictEqual(exports[2], ["testImports", "function"]);
        const source = Buffer.from(files[name + ".js"]).toString();
        assert.ok(source.includes("./test.js"));
        assert.ok(source.includes("FUNCTION_TABLE"));
        for (let i = 0; i < 2; i++) {
            assert.ok(source.includes(exports[i][0]));
        }
    });

    test("Transpile map into package imports", async () => {
        const name = "flavorful";
        const { files, imports } = await transpile(flavorfulWasmBytes, {
            name,
            map: {
                "test:flavorful/*": "#*import",
            },
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(imports[0], "#testimport");
        const source = Buffer.from(files[name + ".js"]).toString();
        assert.ok(source.includes("'#testimport'"));
    });

    test("Type generation", async () => {
        const files = await types("test/fixtures/wits/flavorful", {
            worldName: "test:flavorful/flavorful",
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[0], "flavorful.d.ts");
        assert.strictEqual(Object.keys(files)[1], "interfaces/test-flavorful-test.d.ts");
        assert.ok(
            Buffer.from(files[Object.keys(files)[0]]).includes(
                "export * as test from './interfaces/test-flavorful-test.js'",
            ),
        );
        assert.ok(Buffer.from(files[Object.keys(files)[1]]).includes("export type ListInAlias = "));
    });

    test("Type generation (guest)", async () => {
        const files = await types("test/fixtures/wits/flavorful", {
            worldName: "test:flavorful/flavorful",
            guest: true,
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[1], "interfaces/test-flavorful-test.d.ts");
        assert.ok(Buffer.from(files[Object.keys(files)[0]]).includes("declare module 'test:flavorful/flavorful' {"));
        assert.ok(Buffer.from(files[Object.keys(files)[1]]).includes("declare module 'test:flavorful/test' {"));
    });

    test("Print & Parse", async () => {
        const output = await print(flavorfulWasmBytes);
        assert.strictEqual(output.slice(0, 10), "(component");

        const componentParsed = await parse(output);
        assert.ok(componentParsed);
    });

    test("Wit & New", async () => {
        const wit = await readFile(`test/fixtures/wits/flavorful/flavorful.wit`, "utf8");

        const generatedComponent = await componentEmbed({
            witSource: wit,
            dummy: true,
            metadata: [
                ["language", [["javascript", ""]]],
                ["processed-by", [["dummy-gen", "test"]]],
            ],
        });
        {
            const output = await print(generatedComponent);
            assert.strictEqual(output.slice(0, 7), "(module");
        }

        const newComponent = await componentNew(generatedComponent);
        {
            const output = await print(newComponent);
            assert.strictEqual(output.slice(0, 10), "(component");
        }

        const meta = await metadataShow(newComponent);
        assert.deepStrictEqual(meta[0].metaType, {
            tag: "component",
            val: 5,
        });
        assert.deepStrictEqual(meta[1].producers, [
            [
                "processed-by",
                [
                    ["wit-component", await getCurrentWitComponentVersion()],
                    ["dummy-gen", "test"],
                ],
            ],
            ["language", [["javascript", ""]]],
        ]);
    });

    test("Multi-file WIT", async () => {
        const generatedComponent = await componentEmbed({
            dummy: true,
            witPath:
                (isWindows ? "//?/" : "") +
                fileURLToPath(new URL("./fixtures/componentize/source.wit", import.meta.url)),
            metadata: [
                ["language", [["javascript", ""]]],
                ["processed-by", [["dummy-gen", "test"]]],
            ],
        });
        {
            const output = await print(generatedComponent);
            assert.strictEqual(output.slice(0, 7), "(module");
        }

        const newComponent = await componentNew(generatedComponent);
        {
            const output = await print(newComponent);
            assert.strictEqual(output.slice(0, 10), "(component");
        }

        const meta = await metadataShow(newComponent);
        assert.deepStrictEqual(meta[0].metaType, {
            tag: "component",
            val: 2,
        });
        assert.deepStrictEqual(meta[1].producers, [
            [
                "processed-by",
                [
                    ["wit-component", await getCurrentWitComponentVersion()],
                    ["dummy-gen", "test"],
                ],
            ],
            ["language", [["javascript", ""]]],
        ]);
    });

    test("Component new adapt", async () => {
        const generatedComponent = await componentNew(exitCodeWasmBytes, [
            ["wasi_snapshot_preview1", await readComponentBytes(preview1AdapterReactorPath())],
        ]);

        await print(generatedComponent);
    });

    test("Extract metadata", async () => {
        const meta = await metadataShow(exitCodeWasmBytes);
        assert.deepStrictEqual(meta, [
            {
                metaType: { tag: "module" },
                producers: [],
                name: undefined,
                parentIndex: undefined,
                range: [0, 262],
            },
        ]);
    });

    test("Optimize", async () => {
        const { component: optimizedComponent } = await opt(flavorfulWasmBytes);
        assert.ok(optimizedComponent.byteLength < flavorfulWasmBytes.byteLength);
    });

    // Shared WAT fixture: a component with two [implements=<...>] imports of the
    // same interface under different labels ("primary" and "backup").
    const implementsWat = `
(component
  (type $store-instance (instance
    (type $set-type (func (param "key" string) (param "value" string)))
    (export "set" (func (type $set-type)))
  ))
  (import "[implements=<test:implements/store>]primary" (instance $primary (type $store-instance)))
  (import "[implements=<test:implements/store>]backup" (instance $backup (type $store-instance)))
  (core module $mem_mod
    (memory (export "memory") 1)
    (func (export "cabi_realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance $mem (instantiate $mem_mod))
  (core func $primary-set (canon lower (func $primary "set")
    (memory $mem "memory") (realloc (func $mem "cabi_realloc"))))
  (core func $backup-set (canon lower (func $backup "set")
    (memory $mem "memory") (realloc (func $mem "cabi_realloc"))))
  (core module $m
    (import "env" "memory" (memory 1))
    (import "primary" "set" (func $primary_set (param i32 i32 i32 i32)))
    (import "backup" "set" (func $backup_set (param i32 i32 i32 i32)))
    (func (export "run") (result i32)
      (call $primary_set (i32.const 0) (i32.const 1) (i32.const 0) (i32.const 1))
      (call $backup_set (i32.const 0) (i32.const 1) (i32.const 0) (i32.const 1))
      i32.const 0
    )
    (func (export "cabi_post_run") (param i32))
  )
  (core instance $inst (instantiate $m
    (with "env" (instance (export "memory" (memory $mem "memory"))))
    (with "primary" (instance (export "set" (func $primary-set))))
    (with "backup" (instance (export "set" (func $backup-set))))
  ))
  (type $run-type (func (result string)))
  (func $run (type $run-type) (canon lift (core func $inst "run") (memory $mem "memory") (post-return (func $inst "cabi_post_run"))))
  (export "run" (func $run))
)
`;

    test("Implements - transpile component with multiple instances of same interface", async () => {
        const component = await parse(implementsWat);

        const name = "multi-store";
        const { files, imports, exports } = await transpile(component, { name });

        // Should have separate import specifiers for "primary" and "backup"
        assert.ok(imports.includes("primary"), `Expected "primary" in imports, got: ${JSON.stringify(imports)}`);
        assert.ok(imports.includes("backup"), `Expected "backup" in imports, got: ${JSON.stringify(imports)}`);

        // Verify the generated JS source references both import names
        const source = Buffer.from(files[name + ".js"]).toString();
        assert.ok(source.includes("primary"), "Generated JS should reference 'primary' import");
        assert.ok(source.includes("backup"), "Generated JS should reference 'backup' import");

        // Should have the "run" export
        assert.ok(exports.some(([exportName]) => exportName === "run"), `Expected "run" in exports, got: ${JSON.stringify(exports)}`);
    });

    test("Implements - type generation for implements items", async () => {
        const component = await parse(implementsWat);

        const name = "multi-store";
        const { files } = await transpile(component, { name });

        // Check that .d.ts files are generated for the implements items
        const dtsFile = files[name + ".d.ts"];
        assert.ok(dtsFile, "Should generate a .d.ts file");
        const dtsSource = Buffer.from(dtsFile).toString();

        // Both "primary" and "backup" should appear in the type definitions
        // (as upper camel case: Primary, Backup)
        assert.ok(dtsSource.includes("Primary"), "Type definitions should reference 'Primary'");
        assert.ok(dtsSource.includes("Backup"), "Type definitions should reference 'Backup'");
    });

    test("Transpile & Optimize & Minify", async () => {
        const name = "flavorful";
        const { files, imports, exports } = await transpile(flavorfulWasmBytes, {
            name,
            minify: true,
            validLiftingOptimization: true,
            tlaCompat: true,
            optimize: true,
            base64Cutoff: 0,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ["test", "instance"]);
        assert.ok(files[name + ".js"].length < FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT);
    });
});
