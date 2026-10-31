import assert from 'node:assert/strict';

export async function testJsHelperIntrinsics({ load }) {
    const { initializeDataViewCache, dataView, emptyFunc } = await load('intrinsics/js-helper');
    const cache = initializeDataViewCache();
    const memory = { buffer: new ArrayBuffer(8) };
    const view = dataView(cache, memory);
    view.setUint32(0, 42, true);
    assert.equal(dataView(cache, memory), view);
    assert.equal(view.getUint32(0, true), 42);
    assert.equal(emptyFunc(42), undefined);
}
