import { expect, suite, test } from 'vitest';

import * as resource from '../src/intrinsics/resource.js';
import { CM_RUNTIME_API_VERSION, type ResourceModule, type ResourceTable } from '../src/runtime.js';

const TABLE_FLAG = 1 << 30;
const TABLE_OWN = 2 ** 32;
const context = { RuntimeError: WebAssembly.RuntimeError };
const { tableGet } = resource satisfies ResourceModule;

suite('resource intrinsics', () => {
    test.concurrent('distinguishes a live handle of another resource type from a missing index', () => {
        class SelectedRuntimeError extends Error {}
        const owners = new Map<number, ResourceTable>();
        const first = Object.assign([TABLE_FLAG, 0, 0, 42 + TABLE_OWN], {
            _resourceKind: 'guest-defined resource',
            _resourceOwners: owners,
        });
        const second = Object.assign([TABLE_FLAG, 0], {
            _resourceKind: 'guest-defined resource',
            _resourceOwners: owners,
        });
        owners.set(1, first);
        expect(() => tableGet({ RuntimeError: SelectedRuntimeError }, second, 1)).toThrowError(SelectedRuntimeError);
        expect(() => tableGet(context, second, 1)).toThrow(
            'handle index 1 used with the wrong type, expected guest-defined resource but found a different guest-defined resource',
        );
        expect(tableGet(context, first, 1)).toEqual({ rep: 42, scope: 0, own: true });
        owners.delete(1);
        expect(() => tableGet(context, second, 1)).toThrow('unknown handle index 1');
    });

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
    ])('traps for $name in the selected realm', ({ table, handle }) => {
        class CustomRuntimeError extends Error {}
        // Sparse arrays have undefined holes at runtime, just like out-of-bounds reads.
        const sparseTable = table as number[];
        expect(() => tableGet({ RuntimeError: CustomRuntimeError }, sparseTable, handle)).toThrowError(
            CustomRuntimeError,
        );
        expect(() => tableGet(context, sparseTable, handle)).toThrow(`unknown handle index ${handle}`);
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
    test.concurrent.each([-1, -2147483648])('reports signed core handle %i as an unsigned index', (handle) => {
        expect(() => tableGet(context, [TABLE_FLAG, 0], handle)).toThrow(`unknown handle index ${handle >>> 0}`);
    });
    test.concurrent('a high-bit handle cannot alias a live entry', () => {
        const table = [TABLE_FLAG, 0, 0, 42 + TABLE_OWN];
        expect(tableGet(context, table, 1)).toEqual({ rep: 42, scope: 0, own: true });
        expect(() => tableGet(context, table, 0x80000001)).toThrow('unknown handle index 2147483649');
        expect(tableGet(context, table, 1)).toEqual({ rep: 42, scope: 0, own: true });
    });
    // Preserve the full-u32 and zero-representation regressions from the inline runtime.
    test.concurrent.each([0, 0x40000000, 0x7ffffff0, 0x80000010, 0xc0000010, 0xffffffff])(
        'keeps every bit of owned and borrowed rep %i',
        (rep) => {
            const table = Object.freeze([TABLE_FLAG, 0, 0, rep + TABLE_OWN, 3, rep]);
            expect(tableGet(context, table, 1)).toEqual({ rep, scope: 0, own: true });
            expect(tableGet(context, table, 2)).toEqual({ rep, scope: 3, own: false });
        },
    );
});
