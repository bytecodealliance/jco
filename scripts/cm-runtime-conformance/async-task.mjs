import assert from 'node:assert/strict';

export async function testAsyncTaskIntrinsics({ load }) {
    const {
        asyncBlockedCode,
        initializeTasksByComponent,
        initializeCurrentTaskIds,
        initializeCurrentComponentIdxs,
        initializeSymmetricSyncGuestCallStack,
        initializeCurrentTaskMayBlock,
        initializeAsyncBlockingCallDepth,
        getCurrentTask,
    } = await load('intrinsics/async-task');
    assert.equal(asyncBlockedCode, 0xffff_ffff);
    assert.equal(getCurrentTask({ tasks: initializeTasksByComponent(), registers: {} }, 0), undefined);
    assert.deepEqual(initializeCurrentTaskIds(), []);
    assert.deepEqual(initializeCurrentComponentIdxs(), []);
    assert.deepEqual(initializeSymmetricSyncGuestCallStack(), []);
    assert.equal(initializeCurrentTaskMayBlock(false), false);
    assert.deepEqual(initializeAsyncBlockingCallDepth(false), { value: 0 });
}
