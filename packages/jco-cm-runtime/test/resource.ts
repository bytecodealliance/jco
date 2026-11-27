import { expect, suite, test } from 'vitest';

import { tableRep } from '../src/intrinsics/resource-entry.js';
import * as resource from '../src/intrinsics/resource.js';
import { CM_RUNTIME_API_VERSION, type ResourceModule } from '../src/runtime.js';

const TABLE_FLAG = 1 << 30;
const TABLE_OWN = 2 ** 32;
const context = { RuntimeError: WebAssembly.RuntimeError };
const { tableGet, tableRemove } = resource satisfies ResourceModule;

suite('resource intrinsics', () => {
    test.concurrent('reads owned and borrowed entries without changing the table', () => {
        const table = Object.freeze([TABLE_FLAG, 0, 7, 42 + TABLE_OWN, 11, 24]);
        expect(tableGet(context, table, 1)).toEqual({ rep: 42, scope: 7, own: true });
        expect(tableGet(context, table, 2)).toEqual({ rep: 24, scope: 11, own: false });
        expect(CM_RUNTIME_API_VERSION).toBe(1);
    });

    test.concurrent.each([
        { name: 'sentinel', table: [TABLE_FLAG, 0], handle: 0 },
        { name: 'freed entry', table: [TABLE_FLAG, 0, TABLE_FLAG, 42], handle: 1 },
        { name: 'missing index', table: [TABLE_FLAG, 0], handle: 4 },
        { name: 'hole for another handle kind', table: [TABLE_FLAG, 0, , , 7, 42], handle: 1 },
        // Bit 31 must not alias the live entry the low 31 bits name, as a u32 or a signed i32.
        { name: 'u32 index past 2 ** 31', table: [TABLE_FLAG, 0, 0, 42 + TABLE_OWN], handle: 0x80000001 },
        { name: 'i32 index past 2 ** 31', table: [TABLE_FLAG, 0, 0, 42 + TABLE_OWN], handle: 0x80000001 | 0 },
    ])('traps for $name in the selected realm', ({ table, handle }) => {
        class CustomRuntimeError extends Error {}
        // Sparse arrays have undefined holes at runtime, just like out-of-bounds reads.
        const sparseTable = table as number[];
        expect(() => tableGet({ RuntimeError: CustomRuntimeError }, sparseTable, handle)).toThrowError(
            CustomRuntimeError,
        );
        expect(() => tableRep({ RuntimeError: CustomRuntimeError }, sparseTable, handle)).toThrowError(
            CustomRuntimeError,
        );
        expect(() => tableRep(context, sparseTable, handle)).toThrow(`unknown handle index ${handle >>> 0}`);
        expect(() => tableGet(context, sparseTable, handle)).toThrow(`unknown handle index ${handle >>> 0}`);
    });

    test.concurrent.each([0x80000001, 0x80000001 | 0])('removing index %i traps and keeps entry 1', (handle) => {
        const table = Object.assign([TABLE_FLAG, 0, 0, 42 + TABLE_OWN], { _createdReps: new Set<number>() });
        // The trap comes before the index space or scope tasks are touched.
        const removeContext = context as unknown as Parameters<typeof tableRemove>[0];
        expect(() => tableRemove(removeContext, table, handle)).toThrow(`unknown handle index ${handle >>> 0}`);
        expect(tableGet(context, table, 1)).toEqual({ rep: 42, scope: 0, own: true });
    });

    test.concurrent('uses only the explicit context, including reentrant table reads', () => {
        class OuterTrap extends Error {}
        class InnerTrap extends Error {}
        const outer = { RuntimeError: OuterTrap };
        const inner = { RuntimeError: InnerTrap };
        const table = new Proxy([TABLE_FLAG, 0, TABLE_FLAG, 0], {
            get(target, key, receiver) {
                if (key === '2') {
                    expect(() => tableGet(inner, [TABLE_FLAG, 0], 0)).toThrowError(InnerTrap);
                }
                return Reflect.get(target, key, receiver);
            },
        });
        expect(() => tableGet.call(null, outer, table, 1)).toThrowError(OuterTrap);
    });
    // Preserve the full-u32 and zero-representation regressions from the inline runtime.
    test.concurrent.each([0, 0x40000000, 0x7ffffff0, 0x80000010, 0xc0000010, 0xffffffff])(
        'keeps every bit of owned and borrowed rep %i',
        (rep) => {
            const table = Object.freeze([TABLE_FLAG, 0, 0, rep + TABLE_OWN, 3, rep]);
            expect(tableRep(context, table, 1)).toBe(rep);
            expect(tableRep(context, table, 2)).toBe(rep);
            expect(tableGet(context, table, 1)).toEqual({ rep, scope: 0, own: true });
            expect(tableGet(context, table, 2)).toEqual({ rep, scope: 3, own: false });
        },
    );
});
