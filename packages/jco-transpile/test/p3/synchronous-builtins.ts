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

test.concurrent('a synchronous zero-length rendezvous resumes its copy after a ready helper runs', async () => {
    const directory = await getTmpDir();
    const path = join(directory, 'zero-helper.wasm');
    await writeFile(
        path,
        await parse(`(component
        (type $T (stream u32))
        (core module $Memory (memory (export "memory") 1))
        (core instance $memory (instantiate $Memory))
        (core module $Table (table (export "table") 1 funcref))
        (core instance $table (instantiate $Table))
        (alias core export $table "table" (core table $table))
        (core type $thread-type (func (param i32)))
        (core func $spawn (canon thread.new-indirect $thread-type (core table $table)))
        (canon thread.resume-later (core func $resume))
        (canon stream.new $T (core func $new))
        (canon stream.read $T async (memory (core memory $memory "memory")) (core func $read))
        (canon stream.cancel-read $T async (core func $cancel))
        (canon stream.write $T (memory (core memory $memory "memory")) (core func $write))
        (core module $M
            (import "" "table" (table $table 1 funcref))
            (import "" "spawn" (func $spawn (param i32 i32) (result i32)))
            (import "" "resume" (func $resume (param i32)))
            (import "" "new" (func $new (result i64)))
            (import "" "read" (func $read (param i32 i32 i32) (result i32)))
            (import "" "cancel" (func $cancel (param i32) (result i32)))
            (import "" "write" (func $write (param i32 i32 i32) (result i32)))
            (func $helper (param $reader i32)
                (drop (call $cancel (local.get $reader)))
                (if (i32.ne (call $read (local.get $reader) (i32.const 0) (i32.const 1)) (i32.const 16)) (then unreachable)))
            (elem (table $table) (i32.const 0) func $helper)
            (func (export "f") (result i32)
                (local $ends i64)
                (local.set $ends (call $new))
                (drop (call $read (i32.wrap_i64 (local.get $ends)) (i32.const 0) (i32.const 0)))
                (call $resume (call $spawn (i32.const 0) (i32.wrap_i64 (local.get $ends))))
                (call $write (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32))) (i32.const 0) (i32.const 1))))
        (core instance $m (instantiate $M (with "" (instance
            (export "table" (table $table)) (export "spawn" (func $spawn))
            (export "resume" (func $resume)) (export "new" (func $new))
            (export "read" (func $read)) (export "cancel" (func $cancel))
            (export "write" (func $write))))))
        (func (export "f") (result u32) (canon lift (core func $m "f"))))`),
    );
    let cleanup;
    try {
        const setup = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'zero-helper', path, outputDir: directory },
        });
        cleanup = setup.cleanup;
        assert.equal(await setup.instance.f(), 16);
    } finally {
        await cleanup?.();
        await rm(directory, { recursive: true, force: true });
    }
});

test.concurrent.each([
    { operation: 'write', count: 1 },
    { operation: 'read', count: 1 },
    { operation: 'read', count: 0 },
])(
    'synchronous stream.$operation with count $count blocks against a zero-length peer',
    async ({ operation, count }) => {
        const directory = await getTmpDir();
        const path = join(directory, 'zero-peer.wasm');
        const peerOperation = operation === 'write' ? 'read' : 'write';
        const readHandle = '(i32.wrap_i64 (local.get $ends))';
        const writeHandle = '(i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32)))';
        await writeFile(
            path,
            await parse(`(component
        (type $T (stream u32))
        (core module $Memory (memory (export "memory") 1))
        (core instance $memory (instantiate $Memory))
        (canon stream.new $T (core func $new))
        (canon stream.${peerOperation} $T async (memory (core memory $memory "memory")) (core func $prepare))
        (canon stream.${operation} $T (memory (core memory $memory "memory")) (core func $operation))
        (core module $M
            (import "" "new" (func $new (result i64)))
            (import "" "prepare" (func $prepare (param i32 i32 i32) (result i32)))
            (import "" "operation" (func $operation (param i32 i32 i32) (result i32)))
            (func (export "f")
                (local $ends i64)
                (local.set $ends (call $new))
                (drop (call $prepare ${peerOperation === 'read' ? readHandle : writeHandle} (i32.const 0) (i32.const 0)))
                (drop (call $operation ${operation === 'read' ? readHandle : writeHandle} (i32.const 0) (i32.const ${count})))))
        (core instance $m (instantiate $M (with "" (instance
            (export "new" (func $new))
            (export "prepare" (func $prepare))
            (export "operation" (func $operation))))))
        (func (export "f") (canon lift (core func $m "f"))))`),
        );
        let cleanup;
        try {
            const setup = await setupAsyncTest({
                asyncMode: 'jspi',
                component: { name: 'zero-peer', path, outputDir: directory },
            });
            cleanup = setup.cleanup;
            await expect(async () => setup.instance.f()).rejects.toThrow(cannotBlock);
        } finally {
            await cleanup?.();
            await rm(directory, { recursive: true, force: true });
        }
    },
);
