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

import { readComponentBytes } from "./helpers.js";

const isWindows = platform === "win32";

// - (2025/02/04) incrased due to incoming implementations of async and new flush impl
const FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT = 28_500;

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
    for (let i = 0; i < 2; i++) assert.ok(source.includes(exports[i][0]));
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
    const files = await types("test/fixtures/wit", {
      worldName: "test:flavorful/flavorful",
    });
    assert.strictEqual(Object.keys(files).length, 2);
    assert.strictEqual(Object.keys(files)[0], "flavorful.d.ts");
    assert.strictEqual(
      Object.keys(files)[1],
      "interfaces/test-flavorful-test.d.ts"
    );
    assert.ok(
      Buffer.from(files[Object.keys(files)[0]]).includes(
        "export * as test from './interfaces/test-flavorful-test.js'"
      )
    );
    assert.ok(
      Buffer.from(files[Object.keys(files)[1]]).includes(
        "export type ListInAlias = "
      )
    );
  });

  test("Type generation (guest)", async () => {
    const files = await types("test/fixtures/wit", {
      worldName: "test:flavorful/flavorful",
      guest: true,
    });
    assert.strictEqual(Object.keys(files).length, 2);
    assert.strictEqual(
      Object.keys(files)[1],
      "interfaces/test-flavorful-test.d.ts"
    );
    assert.ok(
      Buffer.from(files[Object.keys(files)[0]]).includes(
        "declare module 'test:flavorful/flavorful' {"
      )
    );
    assert.ok(
      Buffer.from(files[Object.keys(files)[1]]).includes(
        "declare module 'test:flavorful/test' {"
      )
    );
  });

  test("Print & Parse", async () => {
    const output = await print(flavorfulWasmBytes);
    assert.strictEqual(output.slice(0, 10), "(component");

    const componentParsed = await parse(output);
    assert.ok(componentParsed);
  });

  test("Wit & New", async () => {
    const wit = await readFile(
      `test/fixtures/wit/deps/flavorful/flavorful.wit`,
      "utf8"
    );

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
          ["wit-component", "0.225.0"],
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
        fileURLToPath(
          new URL("./fixtures/componentize/source.wit", import.meta.url)
        ),
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
          ["wit-component", "0.225.0"],
          ["dummy-gen", "test"],
        ],
      ],
      ["language", [["javascript", ""]]],
    ]);
  });

  test("Component new adapt", async () => {
    const generatedComponent = await componentNew(exitCodeWasmBytes, [
      [
        "wasi_snapshot_preview1",
        await readComponentBytes(preview1AdapterReactorPath()),
      ],
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
    assert.ok(
      files[name + ".js"].length < FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT
    );
  });
});
