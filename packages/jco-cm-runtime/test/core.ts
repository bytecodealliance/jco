import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, vi } from 'vitest';
import * as operations from '../src/intrinsics/core.js';
import type { ConditionalSuspendingPlatform, ConditionalSlowFn } from '../src/runtime.js';
import { createTestIntrinsics as create } from './core-test-helpers.js';

test.concurrent.each([
    ['conditionalSuspending1I32ToI32', '_conditionalSuspending1I32ToI32'],
    ['conditionalSuspending2I32ToI32', '_conditionalSuspending2I32ToI32'],
    ['conditionalSuspending3I32ToI32', '_conditionalSuspending3I32ToI32'],
    ['conditionalSuspending3I32ToVoid', '_conditionalSuspending3I32ToVoid'],
] as const)('conditional trampoline %s uses the live selected module and platform lazily', (operation, key) => {
    const modules = operations.initializeConditionalSuspendingWasm();
    const selected = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const events: string[] = [];
    const fast = () => 42;
    const slow = async () => 42;
    class Suspending {
        constructor(readonly fn: ConditionalSlowFn) {
            events.push('new Suspending');
        }
    }
    class Instance {
        readonly exports = { run: fast };
        constructor(module: WebAssembly.Module, imports: { '': { fast: unknown; slow: Suspending } }) {
            events.push('new Instance');
            expect(module).toBe(selected);
            expect(imports[''].fast).toBe(fast);
            expect(imports[''].slow).toBeInstanceOf(Suspending);
            expect(imports[''].slow.fn).toBe(slow);
        }
    }
    const platform = {
        get Instance() {
            events.push('Instance');
            return Instance;
        },
        get Suspending() {
            events.push('Suspending');
            return Suspending;
        },
    } as unknown as ConditionalSuspendingPlatform;
    const context = { WebAssembly: platform, modules };
    expect(events).toEqual([]);
    expect(Object.keys(modules)).toEqual([]);
    modules[key] = selected;
    const run = operations[operation](context, fast, slow);
    expect(run).toBe(fast);
    expect(run()).toBe(42);
    expect(events).toEqual(['Instance', 'Suspending', 'new Suspending', 'new Instance']);
});

test.concurrent('core constants, constructors, and receiver-sensitive functions', () => {
    const { core } = create({ asyncDeterminism: 'deterministic' });
    expect(core.asyncDeterminism).toBe('deterministic');
    expect(core.i32Min).toBe(-2147483648);
    expect(core.i32Max).toBe(2147483647);
    expect(core.typeCheckValidI32(1.5)).toBe(true); // Existing range-only check.
    for (const v of [NaN, Infinity, '1', 2147483648, -2147483649]) {
        expect(core.typeCheckValidI32(v)).toBe(false);
    }
    expect(core.typeCheckAsyncFn(async () => {})).toBe(true);
    expect(core.typeCheckAsyncFn(() => Promise.resolve())).toBe(false);
    expect(core.hasOwnProperty.call({ payload: 0 }, 'payload')).toBe(true);
    expect(core.hasOwnProperty.call(Object.create({ payload: 0 }), 'payload')).toBe(false);
    expect(core.symbolDispose).toBe(Symbol.dispose || Symbol.for('dispose'));
    expect(core.symbolCabiDispose).toBe(Symbol.for('cabiDispose'));
    expect(core.symbolResourceRep).toBe(Symbol.for('cabiRep'));
    expect(core.ReadableStream).toBe(ReadableStream);
    expect(core.asyncEventCode).toEqual({
        NONE: 0,
        SUBTASK: 1,
        STREAM_READ: 2,
        STREAM_WRITE: 3,
        FUTURE_READ: 4,
        FUTURE_WRITE: 5,
        TASK_CANCELLED: 6,
    });
    expect(core.clampGuest(3, 1, 4)).toBe(3);
    expect(() => core.clampGuest(5, 1, 4)).toThrow('must be between 1 and 4');
    expect(() => core.throwInvalidBool()).toThrow('invalid variant discriminant for bool');
    expect(() => core.throwUninitialized()).toThrow('Wasm uninitialized use `await $init` first');
});

test.concurrent('component errors preserve payload enumerability and ordinary errors', () => {
    const { core } = create();
    const string = new core.ComponentError('problem');
    const payload = { code: 4 };
    const object = new core.ComponentError(payload);
    expect(string).toBeInstanceOf(Error);
    expect(string).toBeInstanceOf(core.ComponentError);
    expect(Object.keys(string)).not.toContain('payload');
    expect(Object.keys(object)).toContain('payload');
    expect(object.message).toBe('[object Object] (see error.payload)');
    expect(core.getErrorPayload(object)).toBe(payload);
    expect(core.getErrorPayloadString(string)).toBe('problem');
    const error = new Error('plain');
    expect(() => core.getErrorPayload(error)).toThrow(error);
    expect(core.getErrorPayloadString(error)).toBe('plain');
    for (const value of [undefined, null, 0, false, 'x']) {
        expect(core.getErrorPayload(value)).toBe(value);
    }
});

test.concurrent('core stores isolate symbols, maps, classes, and buffer managers', () => {
    const a = create().core;
    const b = create().core;
    for (const key of [
        'symbolResourceHandle',
        'RepTable',
        'ComponentError',
        'ManagedBuffer',
        'bufferManager',
        'componentMemoryMap',
        'currentTaskMeta',
        'conditionalSuspendingWasm',
    ] as const) {
        expect(a[key]).not.toBe(b[key]);
    }
    expect(a.symbolResourceRep).toBe(b.symbolResourceRep);
});

test.concurrent('memory registration retains the existing list and indexed lookup shapes', () => {
    const { core } = create();
    const memory = new WebAssembly.Memory({ initial: 1 });
    expect(core.lookupMemories({ componentIdx: 0 })).toEqual([]);
    expect(core.lookupMemories({ componentIdx: 0, memoryIdx: 0 })).toEqual([]);
    core.registerMemory({ componentIdx: 0, memoryIdx: 2, memory });
    expect(core.lookupMemories({ componentIdx: 0, memoryIdx: 2 })).toBe(memory);
    expect(core.lookupMemories({ componentIdx: 0 })).toEqual([{ componentIdx: 0, memoryIdx: 2, memory }]);
    expect(core.lookupMemories({ componentIdx: 0, memoryIdx: 1 })).toBeUndefined();
    core.registerMemory({ componentIdx: 1, memory });
    expect(core.componentMemoryMap.get(1)?.undefined?.memory).toBe(memory);
    expect(() => core.registerMemory({ componentIdx: 0 })).toThrow('missing both memory & memory idx');
});

test.concurrent('disposal is deferred, preserves the receiver, and prefers async disposal', async () => {
    const { core } = create();
    const calls: unknown[] = [];
    const value = {
        [Symbol.dispose]() {
            calls.push('sync');
        },
        [Symbol.asyncDispose]() {
            calls.push(this);
            return Promise.resolve();
        },
    };
    core.disposeHostValue(value);
    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls).toEqual([value]);
    core.disposeHostValue(42, function () {
        calls.push(this);
    });
    await Promise.resolve();
    expect(calls).toEqual([value, 42]);
    for (const val of [null, undefined, 42, false, {}]) {
        core.disposeHostValue(val);
    }
    const deferred = core.promiseWithResolvers<number>();
    deferred.resolve(7);
    await expect(deferred.promise).resolves.toBe(7);
});

const emptyWasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
test.concurrent.each([false, true])(
    'base64 compilation uses the selected platform (nodejsCompat=%s)',
    async (nodejsCompat) => {
        const calls: unknown[] = [];
        const wasm = {
            RuntimeError: WebAssembly.RuntimeError,
            compile(bytes: BufferSource) {
                calls.push(this);
                return WebAssembly.compile(bytes);
            },
        };
        const core = create({ nodejsCompat, platform: { WebAssembly: wasm } }).core;
        const module = await core.base64Compile(Buffer.from(emptyWasm).toString('base64'));
        expect(module).toBeInstanceOf(WebAssembly.Module);
        expect(calls).toEqual([wasm]);
    },
);

test.concurrent('file and fetch compilation preserve selected WebAssembly and nodejsCompat', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-core-'));
    try {
        const url = pathToFileURL(join(dir, 'empty.wasm'));
        await writeFile(url, emptyWasm);
        const fromFile = await create().core.fetchCompile(url);
        expect(fromFile).toBeInstanceOf(WebAssembly.Module);
        const core = create({ nodejsCompat: false }).core;
        const fromFetch = await core.fetchCompile(
            new URL('data:application/wasm;base64,' + Buffer.from(emptyWasm).toString('base64')),
        );
        expect(fromFetch).toBeInstanceOf(WebAssembly.Module);
        expect(await core.instantiateCore(fromFetch)).toBeInstanceOf(WebAssembly.Instance);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

// Sequential because this test temporarily removes process-wide host APIs.
test('optional host APIs remain lazy and preserve existing fallbacks', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Promise, 'withResolvers');
    let pending!: Promise<number>;
    try {
        vi.stubGlobal('ReadableStream', undefined);
        vi.stubGlobal('FinalizationRegistry', undefined);
        Object.defineProperty(Promise, 'withResolvers', { value: undefined, configurable: true });
        const { core } = create({ platform: { WebAssembly: { RuntimeError: WebAssembly.RuntimeError } } });
        const deferred = core.promiseWithResolvers<number>();
        pending = deferred.promise;
        deferred.resolve(42);
        const registry = core.finalizationRegistryCreate(() => {
            throw new Error('fallback must not invoke cleanup');
        });
        expect(registry.unregister({})).toBeUndefined();
        expect(registry.register).toBeUndefined();
        expect(() => core.ReadableStream).toThrow('builtin stream class [ReadableStream] is not available');
        expect(core.typeCheckValidI32(42)).toBe(true);
    } finally {
        if (descriptor) {
            Object.defineProperty(Promise, 'withResolvers', descriptor);
        } else {
            Reflect.deleteProperty(Promise, 'withResolvers');
        }
        vi.unstubAllGlobals();
    }
    await expect(pending).resolves.toBe(42);
});
