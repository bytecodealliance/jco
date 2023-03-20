// Flags: --instantiation

import * as assert from "node:assert";
import importObject from "../../packages/preview2-shim";
import { instantiate } from "../output/dummy_proxy/dummy_proxy.js";
import * as helpers from "./helpers.js";

async function run() {
  const wasm = await instantiate(helpers.loadWasm, importObject);

  const run = () => wasm.HTTP.handle({}, {});

  assert.throws(run, Error(""));
}

await run()
