import { readdir } from "node:fs/promises";
import { strict as assert } from "node:assert";

const output = await import("./dist/index.mjs");
assert.equal(output.defaultResult, 42);
assert.equal(output.namedResult, 42);

const assets = await readdir(new URL("./dist/assets", import.meta.url));
assert.equal(assets.filter((file) => file.endsWith(".wasm")).length, 1, "expected exactly one emitted core Wasm asset");
