import assert from 'node:assert/strict';

export async function testLowerIntrinsics({ load }) {
    const { lowerFlatU32, lowerFlatChar } = await load('intrinsics/lower');
    const lowerCursor = { componentIdx: 0, vals: [42], memory: { buffer: new ArrayBuffer(8) }, storagePtr: 0 };
    lowerFlatU32({ strict: true }, lowerCursor);
    assert.equal(new DataView(lowerCursor.memory.buffer).getUint32(0, true), 42);
    lowerFlatChar({ ...lowerCursor, vals: ['🚀'] });
    assert.equal(new DataView(lowerCursor.memory.buffer).getUint32(4, true), 0x1f680);
}
