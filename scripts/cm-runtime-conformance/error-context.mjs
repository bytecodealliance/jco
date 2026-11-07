import assert from 'node:assert/strict';

export async function testErrorContextIntrinsics({ load }) {
    const { initializeRepTableClass } = await load('intrinsics/core');
    const RepTable = initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError });
    const {
        initializeGlobalErrorContextTableClass,
        initializeLocalErrorContextTables,
        initializeErrorContextTableRegistrations,
        errCtxReserveGlobalRep,
        errCtxGlobalRefCountAdd,
    } = await load('intrinsics/error-context');
    const GlobalTable = initializeGlobalErrorContextTableClass(RepTable);
    assert.equal(GlobalTable.data, null);
    assert.equal(initializeLocalErrorContextTables().size, 0);
    assert.deepEqual(initializeErrorContextTableRegistrations(), {});
    const reserved = errCtxReserveGlobalRep(GlobalTable, 'release', 0);
    assert.equal(errCtxGlobalRefCountAdd(GlobalTable, reserved.globalRep), 1);
    assert.equal(GlobalTable.get().get(reserved.globalRep).debugMessage, 'release');
}
