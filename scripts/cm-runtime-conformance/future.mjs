import assert from 'node:assert/strict';

export async function testFutureIntrinsics({ load }) {
    const { initializeFutureValueClass, isFutureLowerableObject } = await load('intrinsics/future');
    const FutureValue = initializeFutureValueClass();
    assert.notEqual(FutureValue, initializeFutureValueClass());
    assert.equal(await new FutureValue(() => ({ value: 42 })), 42);
    assert.equal(isFutureLowerableObject(null), false);
}
