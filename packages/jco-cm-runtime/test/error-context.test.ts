import { expect, test } from 'vitest';
import { create } from './error-context-helpers.js';
import type { LocalErrorContext } from '../src/index.js';
import {
    initializeGlobalErrorContextTableClass,
    errCtxReserveGlobalRep,
    errCtxGlobalRefCountAdd,
} from '../src/intrinsics/error-context.js';

test.concurrent('error-context state is lazy, shared within a store, and isolated between stores', () => {
    const a = create();
    const b = create();
    expect(a.errorContext.GlobalErrorContextTable.data).toBeNull();
    expect(a.component.asyncState.size).toBe(0);
    expect(a.errorContext.localTables.size).toBe(0);
    expect(a.errorContext.tables).toEqual({});
    const table = a.errorContext.GlobalErrorContextTable.get();
    expect(table).toBeInstanceOf(a.core.RepTable);
    expect(a.errorContext.GlobalErrorContextTable.get()).toBe(table);
    expect(b.errorContext.GlobalErrorContextTable.data).toBeNull();
    expect(a.errorContext.GlobalErrorContextTable).not.toBe(b.errorContext.GlobalErrorContextTable);
    expect(a.errorContext.tables).not.toBe(b.errorContext.tables);
    expect(a.errorContext.localTables).not.toBe(b.errorContext.localTables);
    const replacement = new a.core.RepTable<{ debugMessage: string; refCount: number }>();
    a.errorContext.GlobalErrorContextTable.data = replacement;
    const reserved = a.errorContext.errCtxReserveGlobalRep('replacement', 3);
    expect(replacement.get(reserved.globalRep)).toBe(reserved.errCtx);
    expect(table.size()).toBe(0);
});

test.concurrent('local tables validate missing entries and upsert only the requested table', () => {
    const { errorContext, core } = create();
    expect(() => errorContext.errCtxGetLocalTable(4, 8)).toThrow('missing local error context table for component [4]');
    const first = errorContext.errCtxGetLocalTable(4, 8, { upsert: true });
    expect(first).toBeInstanceOf(core.RepTable);
    expect(errorContext.errCtxGetLocalTable(4, 8)).toBe(first);
    expect(() => errorContext.errCtxGetLocalTable(4, 9, { upsert: false })).toThrow('missing table [9]');
    const second = errorContext.errCtxGetLocalTable(4, 9, { upsert: true });
    expect(second).not.toBe(first);
    expect(errorContext.errCtxGetLocalTable(5, 8, { upsert: true })).not.toBe(first);
    // Generated initialization mutates the exported map directly.
    const generated = new core.RepTable<number>();
    errorContext.localTables.get(4)!.set(10, generated);
    expect(errorContext.errCtxGetLocalTable(4, 10)).toBe(generated);
    expect(errorContext.GlobalErrorContextTable.data).toBeNull();
});

test.concurrent('new/debug/drop share component handles and reclaim all table entries', () => {
    const { errorContext, component, resource, waitable } = create();
    const local = errorContext.errCtxGetLocalTable(0, 2, { upsert: true });
    const reserved = resource.getHandleIndexSpace(0).alloc();
    const set = waitable.waitableSetNew(0);
    const ctx = {
        componentIdx: 0,
        localTableIdx: 2,
        readStrFn(ptr: number, len: number) {
            expect([ptr, len]).toEqual([123, 7]);
            return 'error 🦀';
        },
    };
    const handle = errorContext.errCtxNew(ctx, 123, 7);
    expect(new Set([reserved, set, handle]).size).toBe(3);
    const state = component.getOrCreateAsyncState(0);
    const meta = state.handles.get(handle) as LocalErrorContext;
    const global = errorContext.GlobalErrorContextTable.get();
    expect(meta.refCount).toBe(1);
    expect(local.get(meta.localIdx)).toBe(handle);
    expect(global.get(meta.globalRep)).toEqual({
        refCount: 1,
        debugMessage: 'error 🦀',
        componentIdx: 0,
        localTableIdx: 2,
        localIdx: meta.localIdx,
        waitableIdx: handle,
    });
    let writes = 0;
    errorContext.errCtxDebugMessage(
        {
            componentIdx: 0,
            writeStrFn(message, ptr) {
                expect([message, ptr]).toEqual(['error 🦀', 456]);
                writes++;
            },
        },
        handle,
        456,
    );
    expect(writes).toBe(1);
    errorContext.errCtxDrop(ctx, handle);
    expect(state.handles.get(handle)).toBeUndefined();
    expect(local.size()).toBe(0);
    expect(global.size()).toBe(0);
    expect(state.handles.contains(set)).toBe(true);
    const next = errorContext.errCtxNew(ctx, 123, 7);
    expect(next).toBe(handle);
    expect((state.handles.get(next) as LocalErrorContext).globalRep).toBe(meta.globalRep);
    errorContext.errCtxDrop(ctx, next);
});

test.concurrent('string callback failures propagate without losing live error contexts', () => {
    const { errorContext, component } = create();
    const ctx = { componentIdx: 0, localTableIdx: 0 };
    errorContext.errCtxGetLocalTable(0, 0, { upsert: true });
    const failure = new Error('string callback');
    expect(() =>
        errorContext.errCtxNew(
            {
                ...ctx,
                readStrFn() {
                    throw failure;
                },
            },
            0,
            1,
        ),
    ).toThrow(failure);
    expect(errorContext.GlobalErrorContextTable.data).toBeNull();
    const handle = errorContext.errCtxNew({ ...ctx, readStrFn: () => '' }, 0, 0);
    expect(() =>
        errorContext.errCtxDebugMessage(
            {
                componentIdx: 0,
                writeStrFn() {
                    throw failure;
                },
            },
            handle,
            0,
        ),
    ).toThrow(failure);
    expect(component.getOrCreateAsyncState(0).handles.contains(handle)).toBe(true);
    errorContext.errCtxDrop(ctx, handle);
    expect(errorContext.GlobalErrorContextTable.get().size()).toBe(0);
});

test.concurrent('global reference counts support default, zero, positive, and negative adjustments', () => {
    const { errorContext } = create();
    const { globalRep, errCtx } = errorContext.errCtxReserveGlobalRep('message', 2);
    expect(errorContext.errCtxGlobalRefCountAdd(globalRep)).toBe(3);
    expect(errorContext.errCtxGlobalRefCountAdd(globalRep, null)).toBe(4);
    expect(errorContext.errCtxGlobalRefCountAdd(globalRep, 0)).toBe(4);
    expect(errorContext.errCtxGlobalRefCountAdd(globalRep, 3)).toBe(7);
    expect(errorContext.errCtxGlobalRefCountAdd(globalRep, -7)).toBe(0);
    expect(errCtx.refCount).toBe(0);
    expect(errorContext.GlobalErrorContextTable.get().contains(globalRep)).toBe(true);
    expect(() => errorContext.errCtxGlobalRefCountAdd(999)).toThrow('missing global error-context [999]');
});

test.concurrent('independent local handles keep a global context alive until the last drop', () => {
    const { errorContext, component } = create();
    const a = errorContext.errCtxGetLocalTable(0, 2, { upsert: true });
    const b = errorContext.errCtxGetLocalTable(1, 3, { upsert: true });
    const { globalRep, errCtx } = errorContext.errCtxReserveGlobalRep('shared', 0);
    const first = errorContext.errCtxCreateLocalHandle(0, a, globalRep);
    const second = errorContext.errCtxCreateLocalHandle(1, b, globalRep);
    expect(errCtx.refCount).toBe(2);
    errorContext.errCtxDrop({ componentIdx: 0, localTableIdx: 2 }, first.waitableIdx);
    expect(errCtx.refCount).toBe(1);
    expect(component.getOrCreateAsyncState(0).handles.size()).toBe(0);
    expect(b.get(second.localIdx)).toBe(second.waitableIdx);
    const messages: string[] = [];
    errorContext.errCtxDebugMessage(
        { componentIdx: 1, writeStrFn: (msg) => messages.push(msg) },
        second.waitableIdx,
        0,
    );
    expect(messages).toEqual(['shared']);
    errorContext.errCtxDrop({ componentIdx: 1, localTableIdx: 3 }, second.waitableIdx);
    expect(errorContext.GlobalErrorContextTable.get().size()).toBe(0);
});

test.concurrent('dropping one local reference retains a handle that is still referenced', () => {
    const { errorContext, component } = create();
    const ctx = { componentIdx: 0, localTableIdx: 0, readStrFn: () => 'retained' };
    const local = errorContext.errCtxGetLocalTable(0, 0, { upsert: true });
    const handle = errorContext.errCtxNew(ctx, 0, 8);
    const state = component.getOrCreateAsyncState(0);
    const meta = state.handles.get(handle) as LocalErrorContext;
    meta.refCount++;
    errorContext.errCtxGlobalRefCountAdd(meta.globalRep);
    errorContext.errCtxDrop(ctx, handle);
    expect(meta.refCount).toBe(1);
    expect(local.get(meta.localIdx)).toBe(handle);
    errorContext.errCtxDrop(ctx, handle);
    expect(local.size()).toBe(0);
    expect(errorContext.GlobalErrorContextTable.get().size()).toBe(0);
});

test.concurrent('transfer reads generated table registration and retains the source for later cleanup', () => {
    const { errorContext, component, core, resource } = create();
    const src = { componentIdx: 1, localTableIdx: 3, readStrFn: () => 'transferred' };
    const sourceTable = errorContext.errCtxGetLocalTable(1, 3, { upsert: true });
    errorContext.tables[3] = { componentIdx: 1, table: new core.RepTable() };
    errorContext.tables[4] = { componentIdx: 2, table: new core.RepTable() };
    resource.getHandleIndexSpace(2).alloc();
    const handle = errorContext.errCtxNew(src, 0, 11);
    const sourceState = component.getOrCreateAsyncState(1);
    const before = sourceState.handles.get(handle) as LocalErrorContext;
    const dest = errorContext.errCtxTransfer(handle, 3, 4);
    const destinationState = component.getOrCreateAsyncState(2);
    const after = destinationState.handles.get(dest) as LocalErrorContext;
    expect(dest).not.toBe(handle);
    expect(before.refCount).toBe(0);
    expect(sourceTable.get(before.localIdx)).toBe(handle);
    expect(after).toEqual({ globalRep: before.globalRep, refCount: 1, localIdx: after.localIdx });
    expect(errorContext.errCtxGetLocalTable(2, 4).get(after.localIdx)).toBe(dest);
    expect(errorContext.GlobalErrorContextTable.get().get(before.globalRep)?.refCount).toBe(2);
    const messages: string[] = [];
    errorContext.errCtxDebugMessage({ componentIdx: 2, writeStrFn: (s) => messages.push(s) }, dest, 0);
    expect(messages).toEqual(['transferred']);
    errorContext.errCtxDrop({ componentIdx: 2, localTableIdx: 4 }, dest);
    expect(errorContext.GlobalErrorContextTable.get().get(before.globalRep)?.refCount).toBe(1);
});

test.concurrent('invalid handles and missing local entries retain the existing diagnostics', () => {
    const { errorContext, component } = create();
    const ctx = { componentIdx: 0, localTableIdx: 0 };
    const local = errorContext.errCtxGetLocalTable(0, 0, { upsert: true });
    expect(() => errorContext.errCtxCreateLocalHandle(0, local, 999)).toThrow('missing global error-context [999]');
    expect(() => errorContext.errCtxDrop(ctx, 999)).toThrow('during drop');
    expect(() => errorContext.errCtxDebugMessage({ componentIdx: 0, writeStrFn() {} }, 999, 0)).toThrow(
        'during debug msg',
    );
    const handle = errorContext.errCtxNew({ ...ctx, readStrFn: () => 'missing local' }, 0, 1);
    const meta = component.getOrCreateAsyncState(0).handles.get(handle) as LocalErrorContext;
    local.remove(meta.localIdx);
    expect(() => errorContext.errCtxDrop(ctx, handle)).toThrow('missing error-context with handle');
    expect(meta.refCount).toBe(1);
});

test.concurrent('global operations need only their live getter and retain lazy selected constructor behavior', () => {
    const { core } = create();
    let constructions = 0;
    const SelectedRep = new Proxy(core.RepTable, {
        construct(target, args, receiver) {
            constructions++;
            return Reflect.construct(target, args, receiver);
        },
    });
    const GlobalTable = initializeGlobalErrorContextTableClass(SelectedRep);
    expect(constructions).toBe(0);
    expect(GlobalTable.data).toBeNull();
    const view = {
        get() {
            expect(this).toBe(view);
            return GlobalTable.get();
        },
    };
    const { globalRep, errCtx } = errCtxReserveGlobalRep(view, 'minimal capability', 0);
    expect(constructions).toBe(1);
    expect(errCtxGlobalRefCountAdd(view, globalRep)).toBe(1);
    expect(errCtx.refCount).toBe(1);
    expect(constructions).toBe(1);
    const previous = GlobalTable.data;
    GlobalTable.data = null;
    expect(GlobalTable.get.call({ data: previous })).not.toBe(previous);
    expect(constructions).toBe(2);
});

test.concurrent('new validates local storage and string reading before reserving global storage', () => {
    const { errorContext } = create();
    let reads = 0;
    const failure = new Error('reader failed');
    const options = {
        componentIdx: 0,
        localTableIdx: 0,
        readStrFn() {
            reads++;
            throw failure;
        },
    };
    expect(() => errorContext.errCtxNew(options, 0, 0)).toThrow('missing local error context table');
    expect(reads).toBe(0);
    errorContext.errCtxGetLocalTable(0, 0, { upsert: true });
    expect(() => errorContext.errCtxNew(options, 0, 0)).toThrow(failure);
    expect(reads).toBe(1);
    expect(errorContext.GlobalErrorContextTable.data).toBeNull();
});

test.concurrent('invalid and wrong-kind error-context handles trap in the selected realm', () => {
    class RuntimeError extends Error {}
    const { errorContext, component, waitable } = create({ platform: { WebAssembly: { RuntimeError } } });
    const state = component.getOrCreateAsyncState(0);
    errorContext.errCtxGetLocalTable(0, 0, { upsert: true });
    const waitableRep = state.handles.insert(new waitable.Waitable({}));
    for (const handle of [0, waitableRep, 999]) {
        expect(() => errorContext.errCtxDrop({ componentIdx: 0, localTableIdx: 0 }, handle)).toThrow(RuntimeError);
        expect(() => errorContext.errCtxDebugMessage({ componentIdx: 0, writeStrFn: () => {} }, handle, 0)).toThrow(
            RuntimeError,
        );
    }
    expect(state.handles.get(waitableRep)).toBeInstanceOf(waitable.Waitable);
    const handle = errorContext.errCtxNew({ componentIdx: 0, localTableIdx: 0, readStrFn: () => 'valid' }, 0, 0);
    errorContext.errCtxDrop({ componentIdx: 0, localTableIdx: 0 }, handle);
    expect(() => errorContext.errCtxDrop({ componentIdx: 0, localTableIdx: 0 }, handle)).toThrow(RuntimeError);
});
