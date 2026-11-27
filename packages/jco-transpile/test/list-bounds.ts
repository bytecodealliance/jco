import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import { assert, expect, suite, test } from 'vitest';

import { transpileBytes } from './transpilation.js';
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
    test('reads the length of a compound list once when lowering it', async () => {
        const fixture = `(component
          (core module $m
            (memory (export "mem") 1)
            (func (export "realloc") (param i32 i32 i32 i32) (result i32) (i32.const 16))
            (func (export "sum") (param $ptr i32) (param $len i32) (result i32)
              (i32.add (local.get $len) (i32.load offset=4 (local.get $ptr)))))
          (core instance $i (instantiate $m))
          (func (export "sum") (param "items" (list (tuple u32 u32))) (result u32)
            (canon lift (core func $i "sum") (memory (core memory $i "mem"))
              (realloc (core func $i "realloc")))))`;
        const { files } = await transpileBytes(await parse(fixture), { name: 'list-length' });
        const guest = await import(
            `data:text/javascript;base64,${Buffer.from(files['list-length.js']).toString('base64')}`
        );
        let lengthReads = 0;
        const items = new Proxy(
            [
                [1, 29],
                [2, 31],
            ],
            {
                get(target, key, receiver) {
                    if (key === 'length') lengthReads++;
                    return Reflect.get(target, key, receiver);
                },
            },
        );
        assert.equal(guest.sum(items), 31);
        assert.equal(lengthReads, 1);
    });

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

    test('checks the allocation against memory after realloc returns', async () => {
        const fixture = new URL('./fixtures/components/list-return-realloc.wat', import.meta.url);
        const { files } = await transpileBytes(await readFile(fixture), {
            name: 'list-return',
            instantiation: 'async',
            base64Cutoff: 0,
        });
        const { instantiate } = await import(
            `data:text/javascript;base64,${Buffer.from(files['list-return.js']).toString('base64')}`
        );
        const load = (name: string) => WebAssembly.compile(new Uint8Array(files[name]));
        const check = async (ptr: number, length: number, words: boolean, grow = false) => {
            const guest = await instantiate(load, {
                bytes: { default: () => new Uint8Array(length).fill(71) },
                words: { default: () => new Uint16Array(length).fill(71) },
            });
            guest.set(ptr, Number(grow));
            return guest.check(Number(words));
        };

        assert.equal(await check(0x1fffc, 2, true, true), 71);
        assert.equal(await check(0xffff, 1, false), 71);
        assert.equal(await check(0x10000, 0, false), 0);
        await expect(check(0x10001, 0, false)).rejects.toThrow(/beyond end of memory/);
        await expect(check(0xfffe, 2, true)).rejects.toThrow(/beyond end of memory/);
        await expect(check(3, 1, true)).rejects.toThrow(/not aligned/);
    });
});
