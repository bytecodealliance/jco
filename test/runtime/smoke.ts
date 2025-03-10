// Flags: --tla-compat --map testwasi=../helpers.js --map test:smoke/imports=../smoke.js --base64-cutoff=2500

import { fileURLToPath } from "node:url";

function assert(x: boolean, msg: string) {
  if (!x) throw new Error(msg);
}

let hit = false;

export function thunk() {
  hit = true;
}

async function run() {
  const wasm = await import(
    fileURLToPath(new URL("../output/smoke/smoke.js", import.meta.url))
  );

  await wasm.$init;

  wasm.thunk();
  assert(hit, "import not called");
}

// Async cycle handling
setTimeout(run);
