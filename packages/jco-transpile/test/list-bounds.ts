import { Buffer } from 'node:buffer';

import { assert, suite, test } from 'vitest';

import { transpileBytes } from '../src/index.js';
import { parse } from '../src/wasm-tools.js';

const COMPONENT = `(component
  (core module $m
    (memory (export "mem") 1)
    (data (i32.const 0xfff0)
      "\\01\\00\\00\\00\\02\\00\\00\\00\\03\\00\\00\\00\\04\\00\\00\\00")
    (func (export "get") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (i32.const 8) (local.get $ptr))
      (i32.store (i32.const 12) (local.get $len))
      (i32.const 8)))
  (core instance $i (instantiate $m))
  (func (export "get-scalars") (param "ptr" u32) (param "len" u32) (result (list u32))
    (canon lift (core func $i "get") (memory (core memory $i "mem"))))
  (func (export "get-compounds")
    (param "ptr" u32)
    (param "len" u32)
    (result (list (tuple u32 u32)))
    (canon lift (core func $i "get") (memory (core memory $i "mem")))))`;

suite('canonical ABI list bounds', () => {
    test('traps instead of truncating lists at the end of memory', async () => {
        const { files } = await transpileBytes(await parse(COMPONENT), {
            name: 'list-bounds',
            tlaCompat: false,
        });
        const source = new TextDecoder().decode(files['list-bounds.js']);
        const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
        const component = await import(url);

        assert.deepEqual([...component.getScalars(0x10000, 0)], []);
        assert.deepEqual([...component.getScalars(0xfff0, 4)], [1, 2, 3, 4]);
        assert.deepEqual(component.getCompounds(0xfff0, 2), [
            [1, 2],
            [3, 4],
        ]);

        for (const [getList, length] of [
            [component.getScalars, 8],
            [component.getCompounds, 3],
        ]) {
            assert.throws(() => getList(0xfff0, length), WebAssembly.RuntimeError);
            assert.throws(() => getList(0xfffffff0, length), WebAssembly.RuntimeError);
        }
    });
});
