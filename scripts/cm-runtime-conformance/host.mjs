import assert from 'node:assert/strict';

export async function testHostIntrinsics({ load }) {
    const host = await load('intrinsics/host');
    assert.deepEqual(Object.keys(host).sort(), [
        'asyncStartCall',
        'prepareCall',
        'storeEventInComponentMemory',
        'syncStartCall',
    ]);
    const eventMemory = { buffer: new ArrayBuffer(8) };
    assert.equal(
        host.storeEventInComponentMemory({
            memory: eventMemory,
            ptr: 0,
            event: { code: 1, payload0: 17, payload1: 23 },
        }),
        1,
    );
    assert.equal(new DataView(eventMemory.buffer).getUint32(4, true), 23);
}
