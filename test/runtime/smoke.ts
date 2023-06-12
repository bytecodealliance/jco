// Flags: --tla-compat --map testwasi=../helpers.js --map test:smoke=../smoke.js --base64-cutoff=2500
function assert(x: boolean, msg: string) {
  if (!x)
    throw new Error(msg);
}

let hit = false;

export const smokeImports = {
  thunk () {
    hit = true;
  }
};

async function run() {
  const wasm = await import('../output/smoke/smoke.js');

  await wasm.$init;

  wasm.thunk();
  assert(hit, "import not called");
}

// Async cycle handling
setTimeout(run);
