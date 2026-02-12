// Flags: --map testwasi=../helpers.js --map test:flavorful/test=../flavorful.js --js

// @ts-nocheck
import * as assert from 'assert';

/*
WIT definition (for reference):

package root:component

world root {
  import test:flavorful/test
  import testwasi: interface {
    log: func(bytes: list<u8>)

    log-err: func(bytes: list<u8>)
  }
  export test:flavorful/test
  export test-imports: func()
}

*/

// Imports
let firstErr = true;
export function fListInRecord1(_x: any) {}
export function fListInRecord2() {
    return { a: 'list_in_record2' };
}
export function fListInRecord3(x: any) {
    assert.strictEqual(x.a, 'list_in_record3 input');
    return { a: 'list_in_record3 output' };
}
export function fListInRecord4(x: any) {
    assert.strictEqual(x.a, 'input4');
    return { a: 'result4' };
}
export function fListInVariant1(a: any, b: any, c: any) {
    assert.strictEqual(a, 'foo');
    assert.deepStrictEqual(b, { tag: 'err', val: 'bar' });
    assert.deepStrictEqual(c, undefined);
}
export function fListInVariant2() {
    return 'list_in_variant2';
}
export function fListInVariant3(x: any) {
    assert.strictEqual(x, 'input3');
    return 'output3';
}
export function errnoResult() {
    if (firstErr) {
        firstErr = false;
        throw 'b';
    }
}
export function listTypedefs(x: any, y: any) {
    assert.strictEqual(x, 'typedef1');
    assert.deepStrictEqual(y, ['typedef2']);
    return [new TextEncoder().encode('typedef3'), ['typedef4']];
}
export function listOfVariants(bools: any, results: any, enums: any) {
    assert.deepStrictEqual(bools, [true, false]);
    assert.deepStrictEqual(results, [
        { tag: 'ok', val: undefined },
        { tag: 'err', val: undefined },
    ]);
    assert.deepStrictEqual(enums, ['success', 'a']);
    return [
        [false, true],
        [
            { tag: 'err', val: undefined },
            { tag: 'ok', val: undefined },
        ],
        ['a', 'b'],
    ];
}

export async function run() {
    const wasm = await import('../output/flavorful/flavorful.js');

    wasm.testImports();
    assert.strictEqual(wasm['test:flavorful/test'], wasm.test);
    wasm.test.fListInRecord1({ a: 'list_in_record1' });
    assert.deepStrictEqual(wasm.test.fListInRecord2(), {
        a: 'list_in_record2',
    });

    assert.deepStrictEqual(
        wasm.test.fListInRecord3({ a: 'list_in_record3 input' }),
        { a: 'list_in_record3 output' }
    );

    assert.deepStrictEqual(wasm.test.fListInRecord4({ a: 'input4' }), {
        a: 'result4',
    });

    wasm.test.fListInVariant1(
        'foo',
        { tag: 'err', val: 'bar' },
        { tag: 0, val: 'baz' }
    );

    assert.deepStrictEqual(wasm.test.fListInVariant2(), 'list_in_variant2');
    assert.deepStrictEqual(wasm.test.fListInVariant3('input3'), 'output3');

    try {
        wasm.test.errnoResult();
        assert.ok(false);
    } catch (e: any) {
        assert.strictEqual(e.constructor.name, 'ComponentError');
        assert.ok(e.toString().includes('Error: b'));
        assert.strictEqual(e.payload, 'b');
    }

    const [r1, r2] = wasm.test.listTypedefs('typedef1', ['typedef2']);
    assert.deepStrictEqual(r1, new TextEncoder().encode('typedef3'));
    assert.deepStrictEqual(r2, ['typedef4']);
}

// TLA cycle avoidance
setTimeout(run);
