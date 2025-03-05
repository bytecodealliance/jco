// Flags: --instantiation

import { fileURLToPath } from "node:url";

// @ts-ignore
import * as assert from "assert";

async function run() {
  const { instantiate } = await import(
    fileURLToPath(new URL("../output/strings/strings.js", import.meta.url))
  );
  const helpers = await import(
    fileURLToPath(new URL("./helpers.js", import.meta.url))
  );
  // @ts-ignore
  const wasm = await instantiate(helpers.loadWasm, {
    ...helpers.wasi,
    "test:strings/imports": {
      takeBasic(s: string) {
        assert.strictEqual(s, "latin utf16");
      },
      returnUnicode() {
        return "🚀🚀🚀 𠈄𓀀";
      },
    },
  });

  wasm.testImports();
  assert.strictEqual(wasm.roundtrip("str"), "str");
  assert.strictEqual(wasm.roundtrip("🚀🚀🚀 𠈄𓀀"), "🚀🚀🚀 𠈄𓀀");
}

await run();
