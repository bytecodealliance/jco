// Flags: --instantiation

import * as helpers from "./helpers.js";
import { instantiate } from "../output/variants/variants.js";
// @ts-ignore
import * as assert from 'assert';

async function run() {
  // @ts-ignore
  const wasm = await instantiate(helpers.loadWasm, {
    ...helpers.wasi,
    'test:variants/test': {
      roundtripOption(x) { return x; },
      roundtripResult(x) {
        if (x.tag == 'ok') {
          return x.val;
        } else {
          throw Object.assign(new Error(''), { payload: Math.round(x.val) });
        }
      },
      roundtripEnum(x) { return x; },
      invertBool(x) { return !x; },
      variantCasts(x) { return x; },
      variantZeros(x) { return x; },
      variantTypedefs(x, y, z) {},
      variantEnums(a, b, c) {
        assert.deepStrictEqual(a, true);
        assert.deepStrictEqual(b, { tag: 'ok', val: undefined });
        assert.deepStrictEqual(c, "success");
        return [
          false,
          { tag: 'err', val: undefined },
          "a",
        ];
      }
    }
  });

  wasm.testImports();
  assert.strictEqual(wasm.test, wasm['test:variants/test']);
  assert.deepStrictEqual(wasm.test.roundtripOption(1), 1);
  assert.deepStrictEqual(wasm.test.roundtripOption(undefined), undefined);
  // @ts-ignore
  assert.deepStrictEqual(wasm.test.roundtripOption(undefined), undefined);
  // @ts-ignore
  assert.deepStrictEqual(wasm.test.roundtripOption(), undefined);
  assert.deepStrictEqual(wasm.test.roundtripOption(2), 2);
  assert.deepStrictEqual(wasm.test.roundtripResult({ tag: 'ok', val: 2 }), 2);
  assert.deepStrictEqual(wasm.test.roundtripResult({ tag: 'ok', val: 4 }), 4);
  const f = Math.fround(5.2);

  try {
    wasm.test.roundtripResult({ tag: 'err', val: f });
    assert.fail('Expected an error');
  } catch (e: any) {
    assert.strictEqual(e.constructor.name, 'ComponentError');
    assert.ok(e.message.includes('5'));
    assert.strictEqual(e.payload, 5);
  }

  assert.deepStrictEqual(wasm.test.roundtripEnum("a"), "a");
  assert.deepStrictEqual(wasm.test.roundtripEnum("b"), "b");

  assert.deepStrictEqual(wasm.test.invertBool(true), false);
  assert.deepStrictEqual(wasm.test.invertBool(false), true);

  {
    const [a1, a2, a3, a4, a5, a6] = wasm.test.variantCasts([
      { tag: 'a', val: 1 },
      { tag: 'a', val: 2 },
      { tag: 'a', val: 3 },
      { tag: 'a', val: 4n },
      { tag: 'a', val: 5n },
      { tag: 'a', val: 6 },
    ]);
    assert.deepStrictEqual(a1, { tag: 'a', val: 1 });
    assert.deepStrictEqual(a2, { tag: 'a', val: 2 });
    assert.deepStrictEqual(a3, { tag: 'a', val: 3 });
    assert.deepStrictEqual(a4, { tag: 'a', val: 4n });
    assert.deepStrictEqual(a5, { tag: 'a', val: 5n });
    assert.deepStrictEqual(a6, { tag: 'a', val: 6 });
  }
  {
    const [b1, b2, b3, b4, b5, b6] = wasm.test.variantCasts([
      { tag: 'b', val: 1n },
      { tag: 'b', val: 2 },
      { tag: 'b', val: 3 },
      { tag: 'b', val: 4 },
      { tag: 'b', val: 5 },
      { tag: 'b', val: 6 },
    ]);
    assert.deepStrictEqual(b1, { tag: 'b', val: 1n });
    assert.deepStrictEqual(b2, { tag: 'b', val: 2 });
    assert.deepStrictEqual(b3, { tag: 'b', val: 3 });
    assert.deepStrictEqual(b4, { tag: 'b', val: 4 });
    assert.deepStrictEqual(b5, { tag: 'b', val: 5 });
    assert.deepStrictEqual(b6, { tag: 'b', val: 6 });
  }

  {
    const [a1, a2, a3, a4] = wasm.test.variantZeros([
      { tag: 'a', val: 1 },
      { tag: 'a', val: 2n },
      { tag: 'a', val: 3 },
      { tag: 'a', val: 4 },
    ]);
    assert.deepStrictEqual(a1, { tag: 'a', val: 1 });
    assert.deepStrictEqual(a2, { tag: 'a', val: 2n });
    assert.deepStrictEqual(a3, { tag: 'a', val: 3 });
    assert.deepStrictEqual(a4, { tag: 'a', val: 4 });
  }

  wasm.test.variantTypedefs(undefined, false, { tag: 'err', val: undefined });
}

await run()
