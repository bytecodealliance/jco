import assert from 'node:assert/strict';

export async function testLiftIntrinsics({ load }) {
    const context = { RuntimeError: WebAssembly.RuntimeError };
    const { liftFlatU32, liftFlatList } = await load('intrinsics/lift');
    const liftCursor = { componentIdx: 0, params: [-1], useDirectParams: true };
    assert.equal(liftFlatU32(liftCursor)[0], 0xffffffff);
    assert.deepEqual(liftCursor.params, []);
    const liftMemory = { buffer: new ArrayBuffer(16) };
    new Uint32Array(liftMemory.buffer).set([17, 23]);
    assert.deepEqual(
        liftFlatList(context, { elemLiftFn: liftFlatU32, elemSize32: 4, elemAlign32: 4 })({
            componentIdx: 0,
            params: [0, 2],
            useDirectParams: true,
            memory: liftMemory,
        })[0],
        [17, 23],
    );
}
