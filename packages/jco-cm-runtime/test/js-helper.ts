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

import { maybeSyncGenerator, conditionalSuspendingHostImport } from '../src/intrinsics/js-helper.js';
import { create as createTasks } from './async-task-helpers.js';
import type { ConditionalHostImportContext } from '../src/runtime.js';

test.concurrent('generator wrapper preserves synchronous receivers, values and throws', () => {
    const wrapped = maybeSyncGenerator(function* (
        this: { base: number },
        value: number,
    ): Generator<unknown, number, unknown> {
        const next = yield value;
        return this.base + (next as number);
    });
    expect(wrapped.call({ base: 2 }, 40)).toBe(42);
    const failure = new Error('sync');
    const throwing = maybeSyncGenerator(function* (): Generator<unknown, never, unknown> {
        throw failure;
    });
    expect(() => throwing()).toThrow(failure);
    const trapping = maybeSyncGenerator(function* () {
        yield {
            get then() {
                throw failure;
            },
        };
    });
    expect(() => trapping()).toThrow(failure);
});

test.concurrent('generator wrapper resumes fulfilled and rejected thenables through finally', async () => {
    const events: string[] = [];
    const wrapped = maybeSyncGenerator(function* (): Generator<unknown, number, unknown> {
        try {
            const value = yield Promise.resolve(40);
            try {
                yield Promise.reject(new Error('expected'));
            } catch (error) {
                events.push((error as Error).message);
            }
            return (value as number) + 2;
        } finally {
            events.push('finally');
        }
    });
    const result = wrapped();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(42);
    expect(events).toEqual(['expected', 'finally']);
});

test.concurrent('conditional host imports read the executing thread at call time', () => {
    const selected = createTasks();
    const { task, taskID, threadID } = selected.asyncTask.createNewCurrentImplicitThread({
        componentIdx: 0,
        isAsync: false,
    });
    const host = () => 42;
    let imports: WebAssembly.Imports | undefined;
    class Instance {
        exports = { run: host };
        constructor(_module: WebAssembly.Module, selectedImports: WebAssembly.Imports) {
            imports = selectedImports;
        }
    }
    class Suspending {
        constructor(readonly fn: Function) {}
    }
    const context = {
        threads: selected.threadLookup,
        WebAssembly: { Instance, Suspending },
    } as unknown as ConditionalHostImportContext;
    expect(conditionalSuspendingHostImport(context, {} as WebAssembly.Module, 0, host)).toBe(host);
    const capabilities = imports![''];
    expect(capabilities.fast).toBe(host);
    expect((capabilities.slow as unknown as Suspending).fn).toBe(host);
    const mayBlock = capabilities.mayBlock as () => boolean;
    expect(mayBlock()).toBe(false);
    selected.threadLookup.registers[0] = { componentIdx: 0, taskID, threadID };
    expect(mayBlock()).toBe(false);
    task.setFuncTypeIsAsync(true);
    expect(mayBlock()).toBe(true);
    delete selected.threadLookup.registers[0];
    expect(mayBlock()).toBe(false);
    selected.asyncTask.clearCurrentTask(0, taskID);
});
