import { expect, test } from 'vitest';
import { create } from './host-helpers.js';
import { clearDeadlockCheck } from './component-helpers.js';
import type { AsyncTask, StoreEventOptions, ComponentWaitableSet, HostCallee } from '../src/runtime.js';

function setup(options: NonNullable<Parameters<typeof create>[0]> = {}) {
    const store = create(options);
    for (const idx of [0, 1]) {
        // Keep these unit tests' scheduler idle; test lifecycle calls are explicit.
        Object.defineProperty(store.component.getOrCreateAsyncState(idx), 'runTickLoop', { value: async () => {} });
        store.component.instanceFlags.set(idx, { value: 1 });
    }
    return {
        ...store,
        cleanup() {
            store.component.setAllError();
            clearDeadlockCheck(store.component);
        },
    };
}
const startOptions = { getCallbackFn: () => null, getPostReturnFn: () => null };
function finish(t: AsyncTask) {
    if (!t.isResolvedState()) {
        t.resolve([]);
    }
    if (!t.isExited()) {
        t.exit({ skipExclusiveLockCheck: true });
    }
}

test.concurrent.each([0, 1, 2])('prepare normalizes encoding %s and captures memory and spilled params', (encoding) => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        const memory = { buffer: new ArrayBuffer(32) };
        s.host.prepareCall(
            3,
            () => memory,
            (...params) => params,
            () => {},
            0,
            1,
            7,
            1,
            encoding,
            -2,
            17,
            23,
            8,
        );
        const child = s.asyncTask.getCurrentTask(1)!.task;
        expect(child.getCalleeParams()).toEqual([17, 23]);
        expect(child.getReturnMemory()).toBe(memory);
        expect(child.getReturnMemoryIdx()).toBe(3);
        expect(child.returnResultTypeIdx()).toBe(7);
        expect(child.subtaskMeta?.stringEncoding).toBe(['utf8', 'utf16', 'compact-utf16'][encoding]);
        expect(child.getParentSubtask()!.getCallMetadata()).toMatchObject({
            resultPtr: 8,
            stringEncoding: child.subtaskMeta!.stringEncoding,
        });
        expect(s.core.getCurrentTaskMeta(1)?.taskID).toBe(child.id());
        expect(child.tryEnter()).toBe(true);
        child.getParentSubtask()!.onStart({ startFnParams: child.getCalleeParams() });
        finish(child);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('prepare rejects implicit synchronous blocking in the selected realm', () => {
    class RuntimeError extends Error {}
    const s = setup({ platform: { WebAssembly: { RuntimeError, Global: WebAssembly.Global } } });
    try {
        const prepare = (result: number) =>
            s.host.prepareCall(
                0,
                () => undefined,
                () => {},
                () => {},
                0,
                1,
                0,
                0,
                0,
                result,
            );
        expect(() => prepare(0)).toThrow(RuntimeError);
        expect(() => prepare(-1)).toThrow('invalid/missing current task');
    } finally {
        s.cleanup();
    }
});

test.concurrent('eager direct callee returns in the same slice and restores blocking depth', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        let returned = 0;
        s.host.prepareCall(
            0,
            () => undefined,
            (...params) => params,
            () => {
                returned++;
            },
            0,
            1,
            0,
            0,
            0,
            -1,
            42,
        );
        const child = s.asyncTask.getCurrentTask(1)!.task;
        let invoked = false;
        const callee = Object.assign(
            (value: unknown) => {
                invoked = true;
                expect(value).toBe(42);
                expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(1);
                expect(s.core.getCurrentTaskMeta(1)?.taskID).toBe(child.id());
                return value;
            },
            { _jcoMaySuspend: false },
        );
        expect(s.host.asyncStartCall(startOptions, callee, 1, 1, 0)).toBe(2);
        expect(invoked).toBe(true);
        expect(returned).toBe(1);
        expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(0);
        expect(child.isExited()).toBe(true);
        expect(parent.getLatestSubtask()).toBeUndefined();
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('eager callee traps reach the caller and release blocking depth', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        s.host.prepareCall(
            0,
            () => undefined,
            () => [],
            () => {},
            0,
            1,
            0,
            0,
            0,
            -1,
        );
        const error = new Error('callee failed');
        expect(() =>
            s.host.asyncStartCall(
                startOptions,
                Object.assign(
                    () => {
                        throw error;
                    },
                    { _jcoMaySuspend: false },
                ),
                0,
                0,
                0,
            ),
        ).toThrow(error);
        expect(parent.isErrored()).toBe(error);
        expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(0);
    } finally {
        s.cleanup();
    }
});

test.concurrent('event writer stores little-endian u32 payloads and validates missing fields', () => {
    const { host } = create();
    const memory = { buffer: new ArrayBuffer(16) };
    const event = { code: 1, payload0: 0x12345678, payload1: -1 };
    expect(host.storeEventInComponentMemory({ memory, ptr: 4, event })).toBe(1);
    expect([...new Uint8Array(memory.buffer).slice(4, 12)]).toEqual([0x78, 0x56, 0x34, 0x12, 255, 255, 255, 255]);
    for (const [args, message] of [
        [{ ptr: 0, event }, 'missing memory'],
        [{ memory, event }, 'missing pointer'],
        [{ memory, ptr: 0 }, 'event object missing'],
        ...['code', 'payload0', 'payload1']
            .map((key) => ({ args: { memory, ptr: 0, event: { ...event, [key]: undefined } }, key }))
            .map(({ args, key }) => [args, `missing ${key}`]),
    ] as [unknown, string][]) {
        expect(() => host.storeEventInComponentMemory(args as StoreEventOptions)).toThrow(message);
    }
    expect(() => host.storeEventInComponentMemory({ memory, ptr: 12, event })).toThrow(RangeError);
});

test.concurrent('default wait and poll write events without generated callbacks', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        const memory = { buffer: new ArrayBuffer(16) };
        const ctx = { componentIdx: 0, isAsync: true, getMemoryFn: () => memory };
        const rep = s.waitable.waitableSetNew(0);
        const set = s.component.getOrCreateAsyncState(0).handles.get(rep) as ComponentWaitableSet;
        const w = new s.waitable.Waitable({ componentIdx: 0 });
        w.join(set);
        expect(s.waitable.waitableSetPoll(ctx, rep, 0)).toBe(0);
        w.setPendingEvent(() => ({ code: 1, payload0: 17, payload1: 23 }));
        expect(s.waitable.waitableSetWait(ctx, rep, 0)).toBe(1);
        const view = new DataView(memory.buffer);
        expect([view.getUint32(0, true), view.getUint32(4, true)]).toEqual([17, 23]);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('JSPI call uses the selected promising wrapper and holds blocking depth across suspension', async () => {
    let wrappers = 0;
    let reads = 0;
    const platform = {
        RuntimeError: WebAssembly.RuntimeError,
        Global: WebAssembly.Global,
        get promising() {
            reads++;
            return function (this: unknown, fn: HostCallee) {
                expect(this).toBe(platform);
                wrappers++;
                return async (...args: unknown[]) => fn(...args);
            };
        },
    };
    const s = setup({
        platform: { WebAssembly: platform },
    });
    try {
        expect(wrappers).toBe(0);
        expect(reads).toBe(0);
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        s.host.prepareCall(
            0,
            () => undefined,
            () => [],
            () => {},
            0,
            1,
            0,
            0,
            0,
            -1,
        );
        const child = s.asyncTask.getCurrentTask(1)!.task;
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const callee = async () => {
            await pending;
            expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(1);
            return 42;
        };
        expect(s.host.asyncStartCall(startOptions, callee, 0, 1, 0) & 15).toBe(1);
        expect(wrappers).toBe(1);
        expect(reads).toBe(1);
        expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(1);
        release();
        await child.exitPromise();
        expect(s.asyncTask.asyncBlockingCallDepth.value).toBe(0);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent.each(['async', 'sync'] as const)(
    '%s start reuses a cached promising wrapper without reading the platform',
    async (mode) => {
        let reads = 0;
        const s = setup({
            platform: {
                WebAssembly: {
                    RuntimeError: WebAssembly.RuntimeError,
                    Global: WebAssembly.Global,
                    get promising(): never {
                        reads++;
                        throw new Error('cached wrapper must avoid optional platform access');
                    },
                },
            },
        });
        try {
            const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
            s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
            s.host.prepareCall(
                null,
                () => null,
                () => [],
                () => 77,
                0,
                1,
                0,
                1,
                0,
                mode === 'async' ? -1 : 0,
            );
            const child = s.asyncTask.getCurrentTask(1)!.task;
            let calls = 0;
            const cached = async () => {
                calls++;
                if (mode === 'sync') {
                    s.asyncTask.taskReturn({ componentIdx: 1, getMemoryFn: () => undefined, liftFns: [] });
                }
                return 42;
            };
            const callee: HostCallee = Object.assign(
                () => {
                    throw new Error('uncached callee called');
                },
                { _cachedPromising: cached },
            );
            if (mode === 'async') {
                expect(s.host.asyncStartCall(startOptions, callee, 0, 1, 0) & 15).toBe(1);
            } else {
                expect(await s.host.syncStartCall(startOptions, callee, 0)).toBe(77);
            }
            await child.exitPromise();
            expect(calls).toBe(1);
            expect(reads).toBe(0);
            expect(callee._cachedPromising).toBe(cached);
            finish(parent);
        } finally {
            s.cleanup();
        }
    },
);

test.concurrent('sync start restores a spawned caller thread and returns fused results', async () => {
    const s = setup({
        platform: {
            WebAssembly: {
                RuntimeError: WebAssembly.RuntimeError,
                Global: WebAssembly.Global,
                promising:
                    (fn) =>
                    async (...args) =>
                        fn(...args),
            },
        },
    });
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const worker = parent.addThread(new s.asyncTask.AsyncThread({ componentIdx: 0, task: parent }));
        worker.storage[0] = 61;
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: worker.id() });
        s.host.prepareCall(
            0,
            () => undefined,
            (...params) => params,
            () => {
                expect(s.core.getCurrentTaskMeta(0)?.threadID).toBe(worker.id());
                expect(s.asyncTask.contextGet({ componentIdx: 0, slot: 0 })).toBe(61);
                return 77;
            },
            0,
            1,
            0,
            1,
            0,
            0,
            23,
        );
        const child = s.asyncTask.getCurrentTask(1)!.task;
        const callee = async (value: unknown) => {
            expect(value).toBe(23);
            const [sibling] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
            s.core.setCurrentTaskMeta({
                componentIdx: 0,
                taskID: sibling.id(),
                threadID: sibling.defaultThread().id(),
            });
            s.asyncTask.taskReturn({ componentIdx: 1, getMemoryFn: () => undefined, liftFns: [] });
            return 0;
        };
        expect(await s.host.syncStartCall(startOptions, callee, 1)).toBe(77);
        expect(s.core.getCurrentTaskMeta(0)?.taskID).toBe(parent.id());
        expect(s.core.getCurrentTaskMeta(0)?.threadID).toBe(worker.id());
        await child.exitPromise();
        parent.removeThread(worker);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('host result lowering receives registered memory when the caller has no return-memory index', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        const memory = { buffer: new ArrayBuffer(16) };
        s.core.registerMemory({ componentIdx: 0, memoryIdx: 2, memory });
        s.host.prepareCall(
            null,
            () => null,
            () => [],
            () => {},
            0,
            1,
            0,
            0,
            0,
            -2,
            4,
        );
        const child = s.asyncTask.getCurrentTask(1)!.task;
        delete child.getParentSubtask()!.getCallMetadata().returnFn;
        let lowered = false;
        child.setReturnLowerFns([
            (ctx) => {
                expect(ctx.memory).toBe(memory);
                expect(ctx.vals).toEqual([42]);
                expect(ctx.storagePtr).toBe(4);
                new DataView(ctx.memory!.buffer).setUint32(ctx.storagePtr!, Number(ctx.vals[0]), true);
                lowered = true;
            },
        ]);
        expect(
            s.host.asyncStartCall(
                startOptions,
                Object.assign(() => 42, { _jcoMaySuspend: false }),
                0,
                1,
                0,
            ),
        ).toBe(2);
        expect(lowered).toBe(true);
        expect(new DataView(memory.buffer).getUint32(4, true)).toBe(42);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent.each([0, 1, 2, 0x7fffffff, -1, -2])(
    'prepare splits core parameters for result convention %s',
    (resultCount) => {
        const s = setup();
        try {
            const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
            s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
            s.host.prepareCall(
                null,
                () => null,
                (...params) => params,
                () => {},
                0,
                1,
                0,
                1,
                0,
                resultCount,
                17,
                23,
            );
            const child = s.asyncTask.getCurrentTask(1)!.task;
            const spilled = resultCount > 1 || resultCount === -2;
            expect(child.getCalleeParams()).toEqual(spilled ? [17] : [17, 23]);
            expect(child.isAsync()).toBe(resultCount < 0);
            expect(child.getParentSubtask()!.getCallMetadata().resultPtr).toBe(spilled ? 23 : null);
            expect(child.tryEnter()).toBe(true);
            child.getParentSubtask()!.onStart({ startFnParams: child.getCalleeParams() });
            finish(child);
            finish(parent);
        } finally {
            s.cleanup();
        }
    },
);

test.concurrent('prepare preserves core ToUint32 pointer coercion and rejects unknown encodings before creating a child', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        s.core.setCurrentTaskMeta({ componentIdx: 0, taskID: parent.id(), threadID: parent.defaultThread().id() });
        expect(() =>
            s.host.prepareCall(
                null,
                () => null,
                () => [],
                () => {},
                0,
                1,
                0,
                1,
                0,
                -2,
                8n,
            ),
        ).toThrow(TypeError);
        expect(() =>
            s.host.prepareCall(
                null,
                () => null,
                () => [],
                () => {},
                0,
                1,
                0,
                1,
                3,
                -1,
            ),
        ).toThrow('unrecognized string encoding');
        expect(s.asyncTask.getCurrentTask(1)).toBeUndefined();
        expect(parent.getLatestSubtask()).toBeUndefined();
        finish(parent);
    } finally {
        s.cleanup();
    }
});
