import assert from 'node:assert/strict';
import { create } from '../../test/async-task-helpers.ts';
import { create as createStream } from '../../test/stream-helpers.ts';
import { contextGet, contextSet, guardCannotLeave } from '../../src/intrinsics/async-task/context.ts';
import { initializeRepTableClass } from '../../src/intrinsics/rep-table.ts';
import { liftFlatS32, liftFlatRecord } from '../../src/intrinsics/lift.ts';
import {
    utf16Encode,
    initializeUtf16Encoding,
    utf8Encode,
    initializeUtf8Encoder,
} from '../../src/intrinsics/string.ts';

/** Encode an unsigned integer in the binary Wasm format. */
function leb(value) {
    const bytes = [];
    do {
        const byte = value & 127;
        value >>>= 7;
        bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
}

/** Make a Wasm loop calling the actual context.get import once per iteration. */
function wasmLoop(get) {
    const bytes = [0, 97, 115, 109, 1, 0, 0, 0];
    const section = (id, body) => bytes.push(id, ...leb(body.length), ...body);
    section(1, [2, 96, 0, 1, 127, 96, 1, 127, 1, 127]);
    section(2, [1, 3, 101, 110, 118, 3, 103, 101, 116, 0, 0]);
    section(3, [1, 1]);
    section(7, [1, 3, 114, 117, 110, 0, 1]);
    // Two i32 locals: index and checksum; sum += get() while index < n.
    const body = [
        1, 2, 127, 2, 64, 3, 64, 32, 1, 32, 0, 79, 13, 1, 32, 2, 16, 0, 106, 33, 2, 32, 1, 65, 1, 106, 33, 1, 12, 0, 11,
        11, 32, 2, 11,
    ];
    section(10, [1, ...leb(body.length), ...body]);
    return new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), { env: { get } }).exports.run;
}

/**
 * Construct the runtime owners outside the timed loops.
 * @param {Function} createLiftContext Runtime factory, or plain options for runtimes that consume them directly.
 */
export function workloads(createLiftContext = (options) => options) {
    const store = create();
    const first = store.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
    const second = first.task.addThread(new store.asyncTask.AsyncThread({ componentIdx: 0, task: first.task }));
    const options = { componentIdx: 0, slot: 0 };
    const registers = store.threadLookup.registers;
    const meta = { componentIdx: 0, threadID: first.threadID, taskID: first.taskID };
    registers.current = registers[0] = meta;
    contextSet(store.threadLookup, options, 42);
    const get = contextGet.bind(null, store.threadLookup, options);
    const wasm = wasmLoop(get);

    // Verify thread switching, recycled/stale identities, fresh realloc slots, and traps.
    registers.current = registers[0] = { ...meta, threadID: second.id() };
    contextSet(store.threadLookup, options, 17);
    assert.equal(get(), 17);
    registers.current = registers[0] = meta;
    assert.equal(get(), 42);
    const fresh = guardCannotLeave(
        store.threadLookup,
        0,
        () => {
            assert.equal(get(), 0);
            contextSet(store.threadLookup, options, 99);
        },
        true,
    );
    fresh();
    assert.equal(get(), 42);
    assert.throws(() => contextGet(store.threadLookup, { ...options, slot: 2 }), /invalid slot/);
    registers.current = registers[0] = { ...meta, taskID: -1n };
    assert.throws(get, /missing\/incomplete/);
    registers.current = registers[0] = meta;

    const RepTable = initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError });
    const table = new RepTable();
    const rep = table.insert(42);
    assert.equal(table.get(rep), 42);
    assert.throws(() => table.get(0));
    const removed = table.insert(7);
    table.remove(removed);
    assert.throws(() => table.remove(removed));

    const params = Array.from({ length: 16 }, (_, index) => index);
    const memory = new WebAssembly.Memory({ initial: 4 });
    const view = new DataView(memory.buffer);
    params.forEach((value, index) => view.setInt32(index * 4, value, true));
    const flat = { componentIdx: 0, params, useDirectParams: true };
    const cursorContext = createLiftContext({ componentIdx: 0, params, useDirectParams: true }, true);
    const indirect = {
        params: [],
        useDirectParams: false,
        memory,
        storagePtr: 0,
        storageLen: 64,
        memoryView: undefined,
    };
    const encoding = initializeUtf16Encoding();
    const text = 'a😀\ud800é'.repeat(256);
    const realloc = () => 1024;
    const encoded = utf16Encode(encoding, text, realloc, memory);
    assert.equal(
        new TextDecoder('utf-16le').decode(new Uint8Array(memory.buffer, encoded.ptr, encoded.len * 2)),
        text.toWellFormed(),
    );

    const stream = createStream();
    const encoder = initializeUtf8Encoder();
    const byteMeta = { align32: 1, payloadTypeName: 'U8', isNumeric: true };
    new Uint8Array(memory.buffer, 16384, 4096).fill(42);
    const recordLift = liftFlatRecord({
        fieldMetas: params.map((_, i) => ['f' + i, liftFlatS32, 4, 4]),
        align32: 4,
        size32: 64,
    });
    const largeParams = Array.from({ length: 128 }, (_, i) => i);
    const largeRecordLift = liftFlatRecord({
        fieldMetas: largeParams.map((_, i) => ['f' + i, liftFlatS32, 4, 4]),
        align32: 4,
        size32: 512,
    });
    const cases = [
        {
            name: 'record-flat-16-reused',
            units: 16,
            expected: 15,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    cursorContext.params = params;
                    sum += recordLift(cursorContext)[0].f15;
                }
                return sum;
            },
        },
        {
            name: 'record-flat-128-owned',
            units: 128,
            expected: 127,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    sum += largeRecordLift(
                        createLiftContext({ componentIdx: 0, useDirectParams: true, params: largeParams }),
                    )[0].f127;
                }
                return sum;
            },
        },
        ...[false, true].map((owned) => ({
            name: owned ? 'record-flat-16-owned' : 'record-flat-16-fresh',
            units: 16,
            expected: 15,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    const options = { componentIdx: 0, useDirectParams: true, params };
                    sum += recordLift(owned ? createLiftContext(options) : options)[0].f15;
                }
                return sum;
            },
        })),
        ...['a'.repeat(4096), 'aé😀'.repeat(1024)].map((value, index) => ({
            name: index ? 'utf8-mixed-4096' : 'utf8-ascii-4096',
            units: 1,
            expected: new TextEncoder().encode(value).length,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    sum += utf8Encode(encoder, value, realloc, memory).len;
                }
                return sum;
            },
        })),
        {
            name: 'queue-4096-chunks',
            units: 1,
            expected: 4096,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    const queue = new stream.PendingValueQueue(() => ({ done: true }), byteMeta);
                    for (let j = 0; j < 4096; j++) {
                        queue.push([42]);
                    }
                    const out = [];
                    sum += queue.drainInto(out, 4096);
                    assert.equal(out[0], 42);
                    assert.equal(out[4095], 42);
                }
                return sum;
            },
        },
        {
            name: 'bulk-bytes-4096',
            units: 1,
            expected: 42,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    const source = new stream.core.ManagedBuffer({
                        componentIdx: 0,
                        capacity: 4096,
                        start: 16384,
                        memory,
                        elemMeta: byteMeta,
                    });
                    const target = new stream.core.ManagedBuffer({
                        componentIdx: 1,
                        capacity: 4096,
                        start: 32768,
                        memory,
                        elemMeta: byteMeta,
                    });
                    if (!source.copyTo?.(target, 4096)) {
                        target.write(source.read(4096));
                    }
                    sum += new Uint8Array(memory.buffer)[32768 + 4095];
                }
                return sum;
            },
        },
        {
            name: 'context-js',
            units: 1,
            expected: 42,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    sum += get();
                }
                return sum;
            },
        },
        { name: 'context-wasm', units: 1, expected: 42, run: wasm },
        {
            name: 'rep-get',
            units: 1,
            expected: 42,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    sum += table.get(rep);
                }
                return sum;
            },
        },
        {
            name: 'rep-recycle',
            units: 1,
            expected: 42,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    const handle = table.insert(42);
                    sum += table.remove(handle);
                }
                return sum;
            },
        },
        {
            name: 'lift-flat-16',
            units: 16,
            expected: 120,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    flat.params = params;
                    for (let j = 0; j < 16; j++) {
                        sum += liftFlatS32(flat)[0];
                    }
                }
                return sum;
            },
        },
        {
            name: 'lift-memory-16',
            units: 16,
            expected: 120,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    indirect.storagePtr = 0;
                    indirect.storageLen = 64;
                    for (let j = 0; j < 16; j++) {
                        sum += liftFlatS32(indirect)[0];
                    }
                }
                return sum;
            },
        },
        {
            name: 'utf16-1280-units',
            units: 1,
            expected: encoded.len,
            run(n) {
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    sum += utf16Encode(encoding, text, realloc, memory).len;
                }
                return sum;
            },
        },
    ];
    for (const item of cases) {
        assert.equal(item.run(100), item.expected * 100, item.name);
    }
    // A cached DataView must be refreshed after growth, even between calls.
    memory.grow(1);
    assert.equal(cases.find((item) => item.name === 'lift-memory-16').run(2), 240);
    return cases;
}
