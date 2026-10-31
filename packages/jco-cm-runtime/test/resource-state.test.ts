import { expect, test } from 'vitest';

import * as operations from '../src/intrinsics/resource.js';
import { initializeTaskRegisters } from '../src/intrinsics/task-context.js';
import type {
    ResourceBorrowTask,
    ResourceDestructorTask,
    ResourceTable,
    ResourceDestructorContext,
    ResourceTransferBorrowContext,
    ResourceModule,
    RuntimeErrorConstructor,
    TaskRegisters,
} from '../src/runtime.js';

type TaskCapabilities = Partial<ResourceDestructorContext> & Pick<ResourceTransferBorrowContext, 'getTask'>;
// Test-only assembly exercises independently selected state owners and operations.
function createResource(
    tasks: TaskCapabilities = {},
    RuntimeError: RuntimeErrorConstructor = WebAssembly.RuntimeError,
) {
    const indexSpaces = operations.initializeHandleIndexSpaces();
    const tables = operations.initializeHandleTables();
    const scopeTasks = operations.initializeResourceScopeTasks();
    const scope = operations.initializeScopeId();
    const counter = operations.initializeResourceScopeCounter();
    const callBorrows = operations.initializeCallBorrows();
    const currentBorrows = operations.initializeCurrentBorrows();
    const registers = tasks.registers ?? initializeTaskRegisters();
    const remove = { RuntimeError, indexSpaces, scopeTasks };
    const transfer = { RuntimeError, indexSpaces, tables, scope, callBorrows, registers, getTask: tasks.getTask };
    const transferBorrow = (handle: number, from: number, to: number) =>
        operations.transferBorrow(transfer, handle, from, to);
    return {
        state: {
            handleIndexSpaces: indexSpaces,
            handleTables: tables,
            scopeTasks,
            registers,
            get scopeId() {
                return scope.value;
            },
            set scopeId(value: number) {
                scope.value = value;
            },
            get scopeCounter() {
                return counter.value;
            },
            set scopeCounter(value: number) {
                counter.value = value;
            },
            get callBorrows() {
                return callBorrows.borrows;
            },
            set callBorrows(value) {
                callBorrows.borrows = value;
            },
            get currentBorrows() {
                return currentBorrows.borrows;
            },
            set currentBorrows(value) {
                currentBorrows.borrows = value;
            },
        },
        getHandleIndexSpace: (key: number | ResourceTable) => operations.getHandleIndexSpace(indexSpaces, key),
        tableCreateOwn: (table: ResourceTable, rep: number) => operations.tableCreateOwn(indexSpaces, table, rep),
        tableCreateBorrow: (table: ResourceTable, rep: number, scope: number) =>
            operations.tableCreateBorrow(indexSpaces, table, rep, scope),
        tableGet: (table: ResourceTable, handle: number) => operations.tableGet({ RuntimeError }, table, handle),
        tableRemove: (table: ResourceTable, handle: number) => operations.tableRemove(remove, table, handle),
        tableEnsureBorrowDrop: operations.tableEnsureBorrowDrop,
        transferBorrow,
        transferBorrowValidLifting: transferBorrow,
        transferOwn: (handle: number, from: number, to: number) =>
            operations.transferOwn({ ...remove, tables }, handle, from, to),
        callDestructor: <T>(args: Parameters<ResourceModule['callDestructor']>[1] & { dtor: (rep: number) => T }) =>
            operations.callDestructor({ ...tasks, registers } as ResourceDestructorContext, args),
    };
}

function table(componentIdx?: number): ResourceTable {
    return Object.assign([1 << 30, 0], { _componentIdx: componentIdx, _createdReps: new Set<number>() });
}

test.concurrent('component handle kinds share an index space and reuse freed indices LIFO', () => {
    const resource = createResource();
    const a = table(0);
    const b = table(0);
    const other = table(1);
    const space = resource.getHandleIndexSpace(0);
    expect(resource.state.handleIndexSpaces.get(0)).toBe(space);
    expect(resource.tableCreateOwn(a, 42)).toBe(1);
    expect(space.alloc()).toBe(2); // An inline waitable/error context allocation.
    expect(resource.tableCreateBorrow(b, 24, 7)).toBe(3);
    expect(resource.tableCreateOwn(other, 5)).toBe(1);
    expect(a._createdReps.has(42)).toBe(true);
    expect(b._createdReps.has(24)).toBe(false);
    expect(() => resource.tableGet(a, 2)).toThrow('unknown handle index 2');
    resource.tableRemove(a, 1);
    resource.tableRemove(b, 3);
    expect(space.alloc()).toBe(3);
    expect(resource.tableCreateOwn(b, 99)).toBe(1);
    expect(resource.tableGet(b, 1)).toEqual({ own: true, scope: 0, rep: 99 });
});

test.concurrent('tables without a component have separate spaces, and stores isolate all state', () => {
    const a = createResource();
    const b = createResource();
    for (const key of Object.keys(a.state) as (keyof typeof a.state)[]) {
        if (typeof a.state[key] === 'object') {
            expect(a.state[key]).not.toBe(b.state[key]);
        }
    }
    const first = table();
    const second = table();
    expect(a.tableCreateOwn(first, 10)).toBe(1);
    expect(a.tableCreateOwn(second, 20)).toBe(1);
    expect(a.getHandleIndexSpace(first)).not.toBe(a.getHandleIndexSpace(second));
    expect(a.getHandleIndexSpace(0)).not.toBe(b.getHandleIndexSpace(0));
    a.state.scopeCounter++;
    expect(b.state.scopeCounter).toBe(0);
});

test.concurrent('borrow drop checks and missing scopes match inline behavior', () => {
    const resource = createResource();
    const t = table();
    // @ts-expect-error Generated JS may omit the required scope.
    expect(() => resource.tableCreateBorrow(t, 42)).toThrow('missing scopeId');
    const handle = resource.tableCreateBorrow(t, 42, 7);
    expect(() => resource.tableEnsureBorrowDrop(t, handle, 7)).toThrow(TypeError);
    resource.tableEnsureBorrowDrop(t, handle, 8);
    resource.tableRemove(t, handle);
    resource.tableEnsureBorrowDrop(t, handle, 7);
});

test.concurrent.each([0, 1, 4])('removal of an unknown handle %s traps without recycling it', (handle) => {
    const resource = createResource();
    const t = table(0);
    expect(() => resource.tableRemove(t, handle)).toThrow(WebAssembly.RuntimeError);
    expect(() => resource.tableRemove(t, handle)).toThrow(`unknown handle index ${handle}`);
    expect(resource.getHandleIndexSpace(0).free).toEqual([]);
});

test.concurrent('removing a borrowed owned handle traps in the selected realm without changing state', () => {
    class Trap extends Error {}
    const resource = createResource({}, Trap);
    const t = table(0);
    const handle = resource.tableCreateOwn(t, 42);
    t[handle << 1]++;
    expect(() => resource.tableRemove(t, handle)).toThrow(Trap);
    expect(() => resource.tableRemove(t, handle)).toThrow('cannot remove owned resource while borrowed');
    expect(resource.tableGet(t, handle)).toEqual({ own: true, scope: 1, rep: 42 });
    expect(resource.getHandleIndexSpace(0).free).toEqual([]);
    t[handle << 1]--;
    expect(resource.tableRemove(t, handle)).toEqual({ own: true, scope: 0, rep: 42 });
    expect(() => resource.tableRemove(t, handle)).toThrow(Trap);
    expect(resource.getHandleIndexSpace(0).free).toEqual([handle]);
});

test.concurrent('zero owned reps can be read and removed', () => {
    const resource = createResource();
    const t = table();
    const handle = resource.tableCreateOwn(t, 0);
    expect(resource.tableGet(t, handle)).toEqual({ rep: 0, scope: 0, own: true });
    expect(resource.tableRemove(t, handle)).toEqual({ rep: 0, scope: 0, own: true });
});

test.concurrent('owned transfer removes the old handle and creates missing target tables', () => {
    const resource = createResource();
    const from = table(0);
    resource.state.handleTables[0] = from;
    const handle = resource.tableCreateOwn(from, 42);
    const transferred = resource.transferOwn(handle, 0, 1);
    expect(() => resource.tableGet(from, handle)).toThrow('unknown handle index');
    const to = resource.state.handleTables[1];
    expect(resource.tableGet(to, transferred)).toEqual({ rep: 42, scope: 0, own: true });
    expect(to._createdReps.has(42)).toBe(true);
    expect(resource.state.callBorrows).toEqual([]);
});

test.concurrent('borrow transfer observes replaced call lists and the live synchronous scope', () => {
    const resource = createResource();
    const from = table();
    resource.state.handleTables[0] = from;
    const handle = resource.tableCreateOwn(from, 42);
    const oldBorrows = resource.state.callBorrows;
    resource.state.callBorrows = [];
    resource.state.scopeId = 17;
    const transferred = resource.transferBorrow(handle, 0, 1);
    expect(resource.tableGet(resource.state.handleTables[1], transferred)).toEqual({ rep: 42, own: false, scope: 17 });
    expect(oldBorrows).toEqual([]);
    expect(resource.state.callBorrows).toEqual([{ rid: 1, handle: transferred }]);
    expect(resource.tableGet(from, handle)).toEqual({ rep: 42, own: true, scope: 0 });
    expect(resource.transferBorrowValidLifting).toBe(resource.transferBorrow);
});

test.concurrent.each([false, true])('task borrow accounting and lender tracking (already borrowed=%s)', (borrowed) => {
    const lenders: { table: ResourceTable; handle: number }[] = [];
    let borrows = 0;
    const task: ResourceBorrowTask = {
        resourceScopeId: () => 17,
        addResourceLender: (table, handle) => {
            lenders.push({ table, handle });
        },
        addBorrowedHandle: () => {
            borrows++;
        },
        removeBorrowedHandle: () => {
            borrows--;
        },
    };
    const resource = createResource({
        getTask(componentIdx) {
            expect(componentIdx).toBe(2);
            return task;
        },
    });
    const from = table(1);
    const to = table(2);
    resource.state.handleTables[0] = from;
    resource.state.handleTables[1] = to;
    resource.state.registers[2] = { taskID: 7n, threadID: 7, componentIdx: 2 };
    resource.state.scopeTasks.set(17, task);
    const handle = borrowed ? resource.tableCreateBorrow(from, 42, 3) : resource.tableCreateOwn(from, 42);
    const transferred = resource.transferBorrow(handle, 0, 1);
    expect(resource.tableGet(to, transferred)).toEqual({ rep: 42, scope: 17, own: false });
    expect(borrows).toBe(1);
    expect(lenders).toEqual(borrowed ? [] : [{ table: from, handle }]);
    expect(from[handle << 1]).toBe(borrowed ? 3 : 1);
    expect(resource.state.callBorrows).toEqual([]);
    resource.tableRemove(to, transferred);
    expect(borrows).toBe(0);
    if (!borrowed) {
        // The task's scope exit releases lenders after validating borrow count.
        expect(() => resource.tableRemove(from, handle)).toThrow('while borrowed');
        for (const { table, handle } of lenders) {
            table[handle << 1]--;
        }
        resource.tableRemove(from, handle);
    }
});

test.concurrent('a borrow returning to its defining table yields the rep and retains its lender', () => {
    let lends = 0;
    let borrows = 0;
    const resource = createResource({
        getTask: () => ({
            resourceScopeId: () => 7,
            addResourceLender: () => {
                lends++;
            },
            addBorrowedHandle: () => {
                borrows++;
            },
            removeBorrowedHandle: () => {
                borrows--;
            },
        }),
    });
    const from = table(1);
    const to = table(2);
    resource.state.handleTables[0] = from;
    resource.state.handleTables[1] = to;
    resource.state.registers[2] = { taskID: 7n, threadID: 7, componentIdx: 2 };
    const handle = resource.tableCreateOwn(from, 42);
    to._createdReps.add(42);
    expect(resource.transferBorrowValidLifting(handle, 0, 1)).toBe(42);
    expect(to).toHaveLength(2);
    expect(lends).toBe(1);
    expect(borrows).toBe(0);
});

test.concurrent.each(['success', 'throw', 'exit-throw', 'already-exited'] as const)(
    'destructor lifecycle restores the enclosing task on %s',
    (mode) => {
        const events: unknown[] = [];
        const failure = new Error('destructor failed');
        let resolved = false;
        let exited = false;
        const registers: TaskRegisters = {
            current: { taskID: 99n, threadID: 41, componentIdx: 2 },
            2: { taskID: 99n, threadID: 41, componentIdx: 2 },
        };
        const task: ResourceDestructorTask = {
            id: () => 7n,
            enterSync: () => {
                events.push('enter');
            },
            resolve(results) {
                events.push(['resolve', results]);
                resolved = true;
            },
            exit(options) {
                events.push(['exit', options]);
                if (mode === 'exit-throw' && !options) {
                    throw failure;
                }
                exited = true;
            },
            isResolvedState: () => resolved,
            setErrored: (error) => {
                events.push(['error', error]);
            },
            reject: (error) => {
                events.push(['reject', error]);
            },
            isExited: () => exited,
        };
        const resource = createResource({
            createTask(args) {
                expect(args).toEqual({
                    componentIdx: 2,
                    isAsync: false,
                    callingWasmExport: true,
                    entryFnName: '<resource-drop>',
                });
                events.push('create');
                return { task, threadID: 17 };
            },
            registers,
        });
        expect(events).toEqual([]); // Runtime creation must not touch the bridge.
        const call = () =>
            resource.callDestructor({
                componentIdx: 2,
                rep: 42,
                dtor(rep) {
                    expect(rep).toBe(42);
                    expect(registers.current?.taskID).toBe(7n);
                    expect(registers.current?.threadID).toBe(17);
                    expect(registers[2]?.taskID).toBe(7n);
                    events.push('dtor');
                    if (mode === 'already-exited') {
                        exited = true;
                    }
                    if (mode === 'throw' || mode === 'already-exited') {
                        throw failure;
                    }
                    return 24;
                },
            });
        if (mode === 'success') {
            expect(call()).toBe(24);
            expect(events).toEqual(['create', 'enter', 'dtor', ['resolve', []], ['exit', undefined]]);
        } else {
            expect(call).toThrow(failure);
            if (mode === 'exit-throw') {
                expect(events).toEqual([
                    'create',
                    'enter',
                    'dtor',
                    ['resolve', []],
                    ['exit', undefined],
                    ['exit', { skipExclusiveLockCheck: true }],
                ]);
            } else {
                expect(events).toEqual([
                    'create',
                    'enter',
                    'dtor',
                    ['error', failure],
                    ['reject', failure],
                    ...(mode === 'throw' ? [['exit', { skipExclusiveLockCheck: true }]] : []),
                ]);
            }
        }
        expect(registers.current?.taskID).toBe(99n);
        expect(registers.current?.threadID).toBe(41);
        expect(registers[2]?.taskID).toBe(99n);
    },
);

test.concurrent('destructors report a missing task bridge before invoking the guest', () => {
    const resource = createResource();
    let called = false;
    expect(() =>
        resource.callDestructor({
            componentIdx: 0,
            rep: 1,
            dtor: () => {
                called = true;
            },
        }),
    ).toThrow('resource destructors require createTask and registers');
    expect(called).toBe(false);
});

test.concurrent.each([0, 0x40000000, 0x7ffffff0, 0x80000010, 0xc0000010, 0xffffffff, -1])(
    'creates, reads, and removes full-u32 owned and borrowed rep %i',
    (input) => {
        const resource = createResource();
        const owned = table();
        const borrowed = table();
        const rep = input >>> 0;
        const ownHandle = resource.tableCreateOwn(owned, input);
        const borrowHandle = resource.tableCreateBorrow(borrowed, input, 3);
        expect(owned._createdReps.has(rep)).toBe(true);
        expect(resource.tableGet(owned, ownHandle)).toEqual({ rep, scope: 0, own: true });
        expect(resource.tableGet(borrowed, borrowHandle)).toEqual({ rep, scope: 3, own: false });
        expect(resource.tableRemove(owned, ownHandle)).toEqual({ rep, scope: 0, own: true });
        expect(resource.tableRemove(borrowed, borrowHandle)).toEqual({ rep, scope: 3, own: false });
        expect(() => resource.tableGet(owned, ownHandle)).toThrow('unknown handle index');
        expect(() => resource.tableGet(borrowed, borrowHandle)).toThrow('unknown handle index');
    },
);
