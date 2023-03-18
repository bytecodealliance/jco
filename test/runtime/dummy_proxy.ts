// Flags: --instantiation

import * as assert from "node:assert";
import { importObject } from "@bytecodealliance/preview2-shim";
import { instantiate } from "../output/dummy_proxy/dummy_proxy.js";
import * as helpers from "./helpers.js";

async function run() {
  const wasm = await instantiate(helpers.loadWasm, importObject);

  // TODO: Should be changed when incoming HTTP is implemented
  assert.equal(wasm.HTTP, undefined);
  // const run = () => wasm.HTTP.handle(0, 1);
  // assert.throws(run, Error(""));
}

await run()
