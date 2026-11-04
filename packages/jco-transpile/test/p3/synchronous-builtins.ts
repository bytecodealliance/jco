import { assert, expect, test } from 'vitest';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { getTmpDir, setupAsyncTest } from '../helpers.js';
import { parse } from '../../src/wasm-tools.js';

const cannotBlock = 'cannot block a synchronous task before returning';

// These exports deliberately have no thread.new-indirect or async calls that
// would cause inferred Promise bindings. A trap must precede JSPI suspension.
test.concurrent.each([
    {
        name: 'future.read',
        type: '(future u32)',
        params: 'i32 i32',
        call: '(i32.wrap_i64 (call $new)) (i32.const 0)',
        error: cannotBlock,
    },
    {
        name: 'future.write',
        type: '(future u32)',
        params: 'i32 i32',
        call: '(i32.wrap_i64 (i64.shr_u (call $new) (i64.const 32))) (i32.const 0)',
        error: cannotBlock,
    },
    {
        name: 'stream.read',
        type: '(stream u32)',
        params: 'i32 i32 i32',
        call: '(i32.wrap_i64 (call $new)) (i32.const 0) (i32.const 1)',
        error: cannotBlock,
    },
    {
        name: 'stream.write',
        type: '(stream u32)',
        params: 'i32 i32 i32',
        call: '(i32.wrap_i64 (i64.shr_u (call $new) (i64.const 32))) (i32.const 0) (i32.const 1)',
        error: cannotBlock,
    },
    { name: 'thread.suspend', error: cannotBlock },
    { name: 'thread.yield' },
    {
        name: 'thread.suspend-then-resume',
        params: 'i32',
        call: '(i32.const 999)',
        error: 'cannot resume thread which is not suspended',
    },
    { name: 'thread.yield-then-promote', params: 'i32', call: '(i32.const 999)', error: 'invalid thread handle' },
])('synchronous $name enforces canonical rules before suspension', async ({ name, type, params, call, error }) => {
    const directory = await getTmpDir();
    const path = join(directory, 'builtin.wasm');
    const kind = name.split('.')[0];
    const memory = type ? '(memory (core memory $memory "memory"))' : '';
    const source = `(component
        (core module $Memory (memory (export "memory") 1))
        (core instance $memory (instantiate $Memory))
        ${type ? `(type $T ${type}) (canon ${kind}.new $T (core func $new))` : ''}
        (canon ${name} ${type ? '$T' : ''} ${memory} (core func $operation))
        (core module $M
            ${type ? '(import "" "new" (func $new (result i64)))' : ''}
            (import "" "operation" (func $operation ${params ? `(param ${params})` : ''} (result i32)))
            (func (export "f") (drop (call $operation ${call ?? ''}))))
        (core instance $m (instantiate $M (with "" (instance
            ${type ? '(export "new" (func $new))' : ''}
            (export "operation" (func $operation))))))
        (func (export "f") (canon lift (core func $m "f"))))`;
    await writeFile(path, await parse(source));
    let cleanup;
    try {
        const setup = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'builtin', path, outputDir: directory },
        });
        cleanup = setup.cleanup;
        if (error) {
            await expect(async () => setup.instance.f()).rejects.toThrow(error);
        } else {
            assert.isUndefined(await setup.instance.f());
        }
    } finally {
        await cleanup?.();
        await rm(directory, { recursive: true, force: true });
    }
});
