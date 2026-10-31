import { expect, test } from 'vitest';

import { dataView, emptyFunc, initializeDataViewCache } from '../src/intrinsics/js-helper.js';

function helpers() {
    const context = initializeDataViewCache();
    return { emptyFunc, dataView: (memory: { readonly buffer: ArrayBufferLike }) => dataView(context, memory) };
}

test.concurrent('emptyFunc ignores values and returns undefined', () => {
    expect(helpers().emptyFunc(1, undefined, 'unused')).toBeUndefined();
});

test.concurrent('reuses the last buffer view and switches between memories', () => {
    const { dataView } = helpers();
    const first = new WebAssembly.Memory({ initial: 1 });
    const second = new WebAssembly.Memory({ initial: 1 });
    const view = dataView(first);
    view.setUint32(4, 42, true);
    expect(dataView(first)).toBe(view);
    expect(dataView({ buffer: first.buffer })).toBe(view);
    expect(dataView(second).getUint32(4, true)).toBe(0);
    expect(dataView(first).getUint32(4, true)).toBe(42);
});

test.concurrent.each([false, true])('refreshes views after memory growth (shared=%s)', (shared) => {
    const { dataView } = helpers();
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2, shared });
    const old = dataView(memory);
    old.setUint32(0, 42, true);
    memory.grow(1);
    const current = dataView(memory);
    // Comparing booleans avoids asking the assertion formatter to inspect the
    // detached view left behind by growth of an ordinary Wasm memory.
    expect(current === old).toBe(false);
    expect(current.buffer).toBe(memory.buffer);
    expect(current.byteLength).toBe(2 * 65536);
    expect(current.getUint32(0, true)).toBe(42);
    current.setUint32(65536, 24, true);
    expect(dataView(memory).getUint32(65536, true)).toBe(24);
});

test.concurrent('each store owns its view cache even when memory is shared', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const first = helpers().dataView(memory);
    const second = helpers().dataView(memory);
    expect(first).not.toBe(second);
    expect(first.buffer).toBe(second.buffer);
});

test.concurrent('cache state stays live under reentrant buffer getters', () => {
    const context = initializeDataViewCache();
    const first = new ArrayBuffer(8),
        second = new ArrayBuffer(8);
    const firstView = dataView(context, { buffer: first });
    let otherView: DataView | undefined;
    const result = dataView(context, {
        get buffer() {
            otherView = dataView(context, { buffer: second });
            return first;
        },
    });
    // The original inline ternary rereads the current view after the getter.
    expect(result).toBe(otherView);
    expect(result === firstView).toBe(false);
});

test.concurrent('buffer getters preserve one read on hit and two on miss', () => {
    const context = initializeDataViewCache();
    const buffer = new ArrayBuffer(8);
    let reads = 0;
    const memory = {
        get buffer() {
            reads++;
            return buffer;
        },
    };
    const view = dataView(context, memory);
    expect(reads).toBe(2);
    expect(dataView(context, memory)).toBe(view);
    expect(reads).toBe(3);
});
