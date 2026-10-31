import assert from 'node:assert/strict';

export async function testConversionIntrinsics({ load }) {
    const { initializeBitcast32, initializeBitcast64, i32ToF32, f64ToI64, toUint32 } =
        await load('intrinsics/conversion');
    assert.equal(toUint32({ strict: false }, -1), 0xffffffff);
    assert.throws(() => toUint32({ strict: true }, -1), TypeError);
    assert.equal(i32ToF32(initializeBitcast32(), 0x3f800000), 1);
    assert.equal(f64ToI64(initializeBitcast64(), 1), 0x3ff0000000000000n);
}
