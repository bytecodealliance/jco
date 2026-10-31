import assert from 'node:assert/strict';

export async function testCoreIntrinsics({ load }) {
    const { initializeTaskRegisters, withCurrentTaskMeta, getCurrentTaskMeta, initializeRepTableClass } =
        await load('intrinsics/core');
    const registers = initializeTaskRegisters();
    assert.equal(
        withCurrentTaskMeta(registers, {
            componentIdx: 0,
            taskID: 1n,
            threadID: 1,
            fn: () => getCurrentTaskMeta(registers).taskID,
        }),
        1n,
    );
    assert.equal(getCurrentTaskMeta(registers), undefined);
    const RepTable = initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError });
    const reps = new RepTable();
    assert.equal(reps.get(reps.insert(42)), 42);
    assert.notEqual(RepTable.FREE, initializeRepTableClass({ RuntimeError: Error }).FREE);
}
