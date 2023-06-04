// Flags: --map testwasi=../helpers.js --map test:flavorful=../flavorful.js --js

// @ts-nocheck
import * as assert from 'assert';

// Imports
let firstErr = true;
export const flavorfulTest = {
  fListInRecord1(x: any) {},
  fListInRecord2() { return { a: 'list_in_record2' }; },
  fListInRecord3(x: any) {
    assert.strictEqual(x.a, 'list_in_record3 input');
    return { a: 'list_in_record3 output' };
  },
  fListInRecord4(x: any) {
    assert.strictEqual(x.a, 'input4');
    return { a: 'result4' };
  },
  fListInVariant1(a: any, b: any, c: any) {
    assert.strictEqual(a, 'foo');
    assert.deepStrictEqual(b, { tag: 'err', val: 'bar' });
    assert.deepStrictEqual(c, { tag: 0, val: 'baz' });
  },
  fListInVariant2() { return 'list_in_variant2'; },
  fListInVariant3(x: any) {
    assert.strictEqual(x, 'input3');
    return 'output3';
  },
  errnoResult() {
    if (firstErr) {
      firstErr = false;
      throw 'b';
    }
  },
  listTypedefs(x: any, y: any) {
    assert.strictEqual(x, 'typedef1');
    assert.deepStrictEqual(y, ['typedef2']);
    return [(new TextEncoder).encode('typedef3'), ['typedef4']];
  },
  listOfVariants(bools: any, results: any, enums: any) {
    assert.deepStrictEqual(bools, [true, false]);
    assert.deepStrictEqual(results, [{ tag: 'ok', val: undefined }, { tag: 'err', val: undefined }]);
    assert.deepStrictEqual(enums, ["success", "a"]);
    return [
      [false, true],
      [{ tag: 'err', val: undefined }, { tag: 'ok', val: undefined }],
      ["a", "b"],
    ];
  }
};

export async function run () {
  const wasm = await import('../output/flavorful/flavorful.js');

  wasm.testImports();
  wasm.test.fListInRecord1({ a: "list_in_record1" });
  assert.deepStrictEqual(wasm.test.fListInRecord2(), { a: "list_in_record2" });

  assert.deepStrictEqual(
    wasm.test.fListInRecord3({ a: "list_in_record3 input" }),
    { a: "list_in_record3 output" },
  );

  assert.deepStrictEqual(
    wasm.test.fListInRecord4({ a: "input4" }),
    { a: "result4" },
  );

  wasm.test.fListInVariant1("foo", { tag: 'err', val: 'bar' }, { tag: 0, val: 'baz' });

  assert.deepStrictEqual(wasm.test.fListInVariant2(), "list_in_variant2");
  assert.deepStrictEqual(wasm.test.fListInVariant3("input3"), "output3");

  try {
    wasm.test.errnoResult();
    assert.ok(false);
  }
  catch (e: any) {
    assert.strictEqual(e.constructor.name, 'ComponentError');
    assert.ok(e.toString().includes('Error: b'));
    assert.strictEqual(e.payload, 'b');
  }

  const [r1, r2] = wasm.test.listTypedefs("typedef1", ["typedef2"]);
  assert.deepStrictEqual(r1, (new TextEncoder()).encode('typedef3'));
  assert.deepStrictEqual(r2, ['typedef4']);
}

// TLA cycle avoidance
setTimeout(run);
