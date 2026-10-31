import { expect, test } from 'vitest';
import type { BufferElementMetadata, ResourceTable } from '../src/runtime.js';
import { createTestIntrinsics as create } from './core-test-helpers.js';
test.concurrent.each([false, true])('rep tables free, reuse, and clear entries (shared=%s)', (shared) => {
    const { core, resource } = create();
    const space = shared ? resource.getHandleIndexSpace(0) : undefined;
    const table = new core.RepTable<{ value: number }>({ space });
    const first = table.insert({ value: 42 });
    const otherKind = space?.alloc();
    const second = table.insert({ value: 24 });
    expect(table.size()).toBe(2);
    expect(table.get(first)).toEqual({ value: 42 });
    expect(table.contains(first)).toBe(true);
    expect(table.remove(first)).toEqual({ value: 42 });
    expect(table.get(first)).toBeUndefined();
    expect(table.contains(first)).toBe(false);
    expect(() => table.remove(first)).toThrow(WebAssembly.RuntimeError);
    expect(table.insert({ value: 12 })).toBe(first);
    table.clear();
    expect(table.size()).toBe(0);
    expect(table.get(second)).toBeUndefined();
    expect(table.data()).toEqual([0, null]);
    if (space) {
        expect(space.free.toSorted()).toEqual([first, second].toSorted());
        expect(space.free).not.toContain(otherKind);
        table.clear();
        expect(space.free).toHaveLength(2);
    }
    expect(table.insert({ value: 7 })).toBe(shared ? second : 1);
});

test.concurrent('rep table lookup traps use the selected realm and preserve falsy entries', () => {
    class Trap extends Error {}
    const { core } = create({ platform: { WebAssembly: { RuntimeError: Trap } } });
    const table = new core.RepTable<number>();
    expect(() => table.get(0)).toThrow(Trap);
    expect(() => table.contains(0)).toThrow('cannot be 0');
    const id = table.insert(0);
    expect(table.contains(id)).toBe(false);
    expect(table.get(id)).toBe(0);
    expect(table.remove(id)).toBe(0);
    expect(() => table.remove(id)).toThrow(Trap);
});

test.concurrent('managed host buffers account for writes, reads, and capacity', () => {
    const { core } = create();
    const buffer = new core.ManagedBuffer({
        componentIdx: -1,
        capacity: 3,
        data: [1, 2, 3],
        elemMeta: { align32: 1 },
        target: 'host',
    });
    expect(buffer.isHostOwned()).toBe(true);
    expect(buffer.read(2)).toEqual([1, 2]);
    expect(buffer.remaining()).toBe(1);
    expect(buffer.read(1)).toEqual([3]);
    expect(buffer.processed).toBe(3);
    expect(() => buffer.write([4])).toThrow('remaining capacity');
    expect(() => buffer.read(0)).toThrow('missing/invalid count');
    const unit = new core.ManagedBuffer({
        componentIdx: -1,
        capacity: 2,
        data: [],
        elemMeta: { align32: 1, isNone: true },
    });
    expect(() => unit.write([1])).toThrow('non-null');
    unit.write([null]);
    expect(unit.remaining()).toBe(1);
    expect(unit.read(1)).toEqual([null]);
});

test.concurrent('managed byte buffers observe memory growth and advance their pointers', () => {
    const { core } = create();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const elemMeta = { align32: 1, payloadTypeName: 'U8' };
    const buffer = new core.ManagedBuffer({ componentIdx: 0, capacity: 4, start: 8, memory, elemMeta });
    buffer.write([1, 2]);
    memory.grow(1);
    buffer.write([3, 4]);
    expect([...new Uint8Array(memory.buffer, 8, 4)]).toEqual([1, 2, 3, 4]);
    const reader = new core.ManagedBuffer({ componentIdx: 0, capacity: 4, start: 8, memory, elemMeta });
    expect(reader.read(2)).toEqual([1, 2]);
    expect(reader.read(2)).toEqual([3, 4]);
});

test.concurrent('managed structured buffers transfer resource ownership through the shared tables', () => {
    const { core, resource } = create();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const table: ResourceTable = Object.assign([resource.tableFlag, 0], { _createdReps: new Set<number>() });
    resource.state.handleTables[0] = table;
    const handle = resource.tableCreateOwn(table, 42);
    new DataView(memory.buffer).setUint32(0, handle, true);
    const elemMeta: BufferElementMetadata = {
        align32: 4,
        stringEncoding: 'utf8',
        liftFn(ctx) {
            const handle = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
            ctx.storagePtr += 4;
            return [ctx.liftResource!(handle, 0), ctx];
        },
        lowerFn(ctx) {
            const handle = ctx.lowerResource!(ctx.vals![0] as { rep: number }, 1);
            new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, handle, true);
            ctx.storagePtr += 4;
        },
    };
    const reader = new core.ManagedBuffer({ componentIdx: 0, capacity: 1, start: 0, memory, elemMeta });
    const values = reader.read(1, { transferResources: true });
    expect(values).toEqual([{ rep: 42 }]);
    expect(() => resource.tableGet(table, handle)).toThrow('unknown handle');
    const writer = new core.ManagedBuffer({ componentIdx: 1, capacity: 1, start: 4, memory, elemMeta });
    writer.write(values, { transferResources: true });
    const transferred = new DataView(memory.buffer).getUint32(4, true);
    expect(resource.tableGet(resource.state.handleTables[1], transferred)).toEqual({ rep: 42, scope: 0, own: true });
});

test.concurrent('buffer managers keep per-component IDs and support deletion', () => {
    const { core } = create();
    const manager = core.bufferManager;
    const args = { componentIdx: 0, data: [], count: 2, elemMeta: { align32: 1 }, target: 'test' };
    const a = manager.createBuffer(args);
    const b = manager.createBuffer(args);
    const c = manager.createBuffer({ ...args, componentIdx: 1 });
    expect([a.id, b.id, c.id]).toEqual([1n, 2n, 1n]);
    expect(a.buffer).toBeInstanceOf(core.ManagedBuffer);
    expect(manager.getBuffer(0, a.id)).toBe(a.buffer);
    expect(manager.deleteBuffer(0, a.id)).toBe(true);
    expect(manager.getBuffer(0, a.id)).toBeUndefined();
    expect(manager.deleteBuffer(99, a.id)).toBeUndefined();
    expect(() => manager.createBuffer({ ...args, count: core.ManagedBuffer.MAX_LENGTH + 1 })).toThrow(
        'greater than max length',
    );
});

test.concurrent('guest buffers validate alignment and bounds even for zero-length ranges', () => {
    class Trap extends Error {}
    const { core } = create({ platform: { WebAssembly: { RuntimeError: Trap } } });
    const memory = new WebAssembly.Memory({ initial: 1 });
    const elemMeta = { align32: 4, size32: 4 };
    expect(() => core.ManagedBuffer.validateGuestBuffer(memory, 3, 0, elemMeta)).toThrow(Trap);
    expect(() => core.ManagedBuffer.validateGuestBuffer(memory, 65540, 0, elemMeta)).toThrow(Trap);
    expect(() => core.ManagedBuffer.validateGuestBuffer(memory, 65536, 1, elemMeta)).toThrow(Trap);
    expect(() => new core.ManagedBuffer({ componentIdx: 0, memory, start: 3, capacity: 0, elemMeta })).toThrow(Trap);
    expect(
        () => new core.ManagedBuffer({ componentIdx: 0, memory, start: 65536, capacity: 0, elemMeta }),
    ).not.toThrow();
    expect(() => core.ManagedBuffer.validateGuestBuffer(memory, 3, 10, { ...elemMeta, isNone: true })).not.toThrow();
});
