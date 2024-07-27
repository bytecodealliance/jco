// Flags: --instantiation

import * as helpers from "./helpers.js";
import { instantiate, ImportObject } from "../output/records/records.js";
// @ts-ignore
import * as assert from 'node:assert';

async function run() {
  // @ts-ignore
  const wasm = await instantiate(helpers.loadWasm, {
    ...helpers.wasi,
    'test:records/test': {
      multipleResults() { return [4, 5]; },
      swapTuple([a, b]) { return [b, a]; },
      roundtripFlags1(x) { return x; },
      roundtripFlags2(x) { return x; },
      roundtripFlags3(r0, r1, r2) { return [r0, r1, r2]; },
      roundtripRecord1(x) { return x; },
      tuple1([x]) { return [x]; },
    }
  });

  wasm.testImports();
  assert.deepStrictEqual(wasm.test, wasm['test:records/test']);
  assert.deepEqual(wasm.test.multipleResults(), [100, 200]);
  assert.deepStrictEqual(wasm.test.swapTuple([1, 2]), [2, 1]);
  assert.deepEqual(wasm.test.roundtripFlags1({ a: true }), { a: true, b: false });
  assert.deepEqual(wasm.test.roundtripFlags1({}), { a: false, b: false });
  assert.deepEqual(wasm.test.roundtripFlags1({ a: true, b: true }), { a: true, b: true });

  assert.deepEqual(wasm.test.roundtripFlags2({ c: true }), { c: true, d: false, e: false });
  assert.deepEqual(wasm.test.roundtripFlags2({}), { c: false, d: false, e: false });
  assert.deepEqual(wasm.test.roundtripFlags2({ d: true }), { c: false, d: true, e: false });
  assert.deepEqual(wasm.test.roundtripFlags2({ c: true, e: true }), { c: true, d: false, e: true });

  {
    const { a, b } = wasm.test.roundtripRecord1({ a: 8, b: {} });
    assert.deepEqual(a, 8);
    assert.deepEqual(b, { a: false, b: false });
  }

  {
    const { a, b } = wasm.test.roundtripRecord1({ a: 0, b: { a: true, b: true } });
    assert.deepEqual(a, 0);
    assert.deepEqual(b, { a: true, b: true });
  }

  assert.deepStrictEqual(wasm.test.tuple1([1]), [1]);
}

await run()
