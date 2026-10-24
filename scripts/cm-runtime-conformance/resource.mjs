import assert from 'node:assert/strict';

const TABLE_FLAG = 1 << 30;

export function testTableGetEntries(tableGet, context) {
    const table = Object.freeze([TABLE_FLAG, 0, 7, 42 + 2 ** 32, 11, 24]);
    assert.deepEqual(tableGet(context, table, 1), { rep: 42, scope: 7, own: true }, 'tableGet owned entry');
    assert.deepEqual(tableGet(context, table, 2), { rep: 24, scope: 11, own: false }, 'tableGet borrowed entry');
}

export function testTableGetTraps(tableGet, context) {
    for (const { table, handle, name } of [
        { table: [TABLE_FLAG, 0], handle: 0, name: 'sentinel' },
        { table: [TABLE_FLAG, 0], handle: 4, name: 'missing entry' },
        { table: [TABLE_FLAG, 0, TABLE_FLAG, 42], handle: 1, name: 'freed entry' },
    ]) {
        assert.throws(() => tableGet(context, table, handle), context.RuntimeError, `tableGet ${name}`);
    }
}

export function testTableGetTrapContext(tableGet) {
    class SelectedRuntimeError extends Error {}
    assert.throws(
        () => tableGet({ RuntimeError: SelectedRuntimeError }, [TABLE_FLAG, 0], 0),
        SelectedRuntimeError,
        'tableGet uses the supplied trap constructor',
    );
}

/** Add each resource operation here; operation tests can also be called individually. */
export async function testResourceIntrinsics({ load }) {
    const { tableGet } = await load('intrinsics/resource');
    assert.equal(typeof tableGet, 'function', 'resource.tableGet export');
    const context = { RuntimeError: WebAssembly.RuntimeError };
    testTableGetEntries(tableGet, context);
    testTableGetTraps(tableGet, context);
    testTableGetTrapContext(tableGet);
}
