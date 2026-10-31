import assert from 'node:assert/strict';

export async function testWaitableIntrinsics({ load }) {
    const { initializeWaitableClass, initializeWaitableSetClass } = await load('intrinsics/waitable');
    const Waitable = initializeWaitableClass();
    const WaitableSet = initializeWaitableSetClass({ TASK_CANCELLED: 3 });
    const waitable = new Waitable({ target: 42 });
    const set = new WaitableSet(0);
    waitable.join(set);
    assert.deepEqual(set.targets(), [42]);
    waitable.setPendingEvent(() => ({ code: 1, payload0: 17, payload1: 23 }));
    assert.deepEqual(set.getPendingEvent(), { code: 1, payload0: 17, payload1: 23 });
    assert.equal(waitable.getPendingEvent(), null);
    waitable.drop();
    assert.equal(set.numWaitables(), 0);
    assert.notEqual(Waitable, initializeWaitableClass());
}
