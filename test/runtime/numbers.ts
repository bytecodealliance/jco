// Flags: --instantiation

import * as helpers from "./helpers.js";
import { instantiate } from "../output/numbers/numbers.js";
import { strictEqual } from 'node:assert';
function assert(x: boolean) {
  if (!x)
    throw new Error("assert failed");
}

async function run() {
  let scalar = 0;
  const wasm = await instantiate(helpers.loadWasm, {
    testwasi: helpers,
    numbers: {
      numbersTest: {
        roundtripU8(x) { return x; },
        roundtripS8(x) { return x; },
        roundtripU16(x) { return x; },
        roundtripS16(x) { return x; },
        roundtripU32(x) { return x; },
        roundtripS32(x) { return x; },
        roundtripU64(x) { return x; },
        roundtripS64(x) { return x; },
        roundtripFloat32(x) { return x; },
        roundtripFloat64(x) { return x; },
        roundtripChar(x) { return x; },
        setScalar(x) { scalar = x; },
        getScalar() { return scalar; },
      }
    }
  });

  wasm.testImports();

  strictEqual(wasm.numbersTest, wasm.test);

  strictEqual(wasm.test.roundtripU8(1), 1);
  strictEqual(wasm.test.roundtripU8((1 << 8) - 1), (1 << 8) - 1);

  strictEqual(wasm.test.roundtripS8(1), 1);
  strictEqual(wasm.test.roundtripS8((1 << 7) - 1), (1 << 7) - 1);
  strictEqual(wasm.test.roundtripS8(-(1 << 7)), -(1 << 7));

  strictEqual(wasm.test.roundtripU16(1), 1);
  strictEqual(wasm.test.roundtripU16((1 << 16) - 1), (1 << 16) - 1);

  strictEqual(wasm.test.roundtripS16(1), 1);
  strictEqual(wasm.test.roundtripS16((1 << 15) - 1), (1 << 15) - 1);
  strictEqual(wasm.test.roundtripS16(-(1 << 15)), -(1 << 15));

  strictEqual(wasm.test.roundtripU32(1), 1);
  strictEqual(wasm.test.roundtripU32(~0 >>> 0), ~0 >>> 0);

  strictEqual(wasm.test.roundtripS32(1), 1);
  strictEqual(wasm.test.roundtripS32(((1 << 31) - 1) >>> 0), ((1 << 31) - 1) >>> 0);
  strictEqual(wasm.test.roundtripS32(1 << 31), 1 << 31);

  strictEqual(wasm.test.roundtripU64(1n), 1n);
  strictEqual(wasm.test.roundtripU64((1n << 64n) - 1n), (1n << 64n) - 1n);

  strictEqual(wasm.test.roundtripS64(1n), 1n);
  strictEqual(wasm.test.roundtripS64((1n << 63n) - 1n), (1n << 63n) - 1n);
  strictEqual(wasm.test.roundtripS64(-(1n << 63n)), -(1n << 63n));

  strictEqual(wasm.test.roundtripFloat32(1), 1);
  strictEqual(wasm.test.roundtripFloat32(Infinity), Infinity);
  strictEqual(wasm.test.roundtripFloat32(-Infinity), -Infinity);
  assert(Number.isNaN(wasm.test.roundtripFloat32(NaN)));

  strictEqual(wasm.test.roundtripFloat64(1), 1);
  strictEqual(wasm.test.roundtripFloat64(Infinity), Infinity);
  strictEqual(wasm.test.roundtripFloat64(-Infinity), -Infinity);
  assert(Number.isNaN(wasm.test.roundtripFloat64(NaN)));

  strictEqual(wasm.test.roundtripChar('a'), 'a');
  strictEqual(wasm.test.roundtripChar(' '), ' ');
  strictEqual(wasm.test.roundtripChar('🚩'), '🚩');

  wasm.test.setScalar(2);
  strictEqual(wasm.test.getScalar(), 2);
  wasm.test.setScalar(4);
  strictEqual(wasm.test.getScalar(), 4);
}

await run()
