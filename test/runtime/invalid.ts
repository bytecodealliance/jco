// Flags: --instantiation

import { instantiate } from "../output/invalid/invalid.js";
import * as helpers from "./helpers.js";
// @ts-ignore
import * as assert from 'assert';

async function run() {
  const wasm = await instantiate(helpers.loadWasm, {
    testwasi: helpers,
    imports: {
      roundtripU8() { throw new Error('unreachable'); },
      roundtripS8() { throw new Error('unreachable'); },
      roundtripU16() { throw new Error('unreachable'); },
      roundtripS16() { throw new Error('unreachable'); },
      roundtripBool() { throw new Error('unreachable'); },
      roundtripChar() { throw new Error('unreachable'); },
      roundtripEnum() { throw new Error('unreachable'); },
      unaligned1() { throw new Error('unreachable'); },
      unaligned2() { throw new Error('unreachable'); },
      unaligned3() { throw new Error('unreachable'); },
      unaligned4() { throw new Error('unreachable'); },
      unaligned5() { throw new Error('unreachable'); },
      unaligned6() { throw new Error('unreachable'); },
      unaligned7() { throw new Error('unreachable'); },
      unaligned8() { throw new Error('unreachable'); },
      unaligned9() { throw new Error('unreachable'); },
      unaligned10() { throw new Error('unreachable'); },
    },
  });

  // FIXME(#376) these should succeed
  assert.throws(() => wasm.invalidBool(), /invalid variant discriminant for bool/);
  assert.throws(() => wasm.invalidU8(), /must be between/);
  assert.throws(() => wasm.invalidS8(), /must be between/);
  assert.throws(() => wasm.invalidU16(), /must be between/);
  assert.throws(() => wasm.invalidS16(), /must be between/);

  // FIXME(#375) these should require a new instantiation
  assert.throws(() => wasm.invalidChar(), /not a valid char/);
  assert.throws(() => wasm.invalidEnum(), /invalid discriminant specified for E/);

    /*
  assert.throws(() => wasm.testUnaligned(), /is not aligned/);
    */
}

await run()
