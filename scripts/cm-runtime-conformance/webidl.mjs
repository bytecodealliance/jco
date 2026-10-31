import assert from 'node:assert/strict';

export async function testWebidlIntrinsics({ load }) {
    const { initializeWebIdlProxyCache, globalThisIdlProxy } = await load('intrinsics/webidl');
    const webIdlCache = initializeWebIdlProxyCache();
    const proxy = globalThisIdlProxy(webIdlCache);
    assert.equal(globalThisIdlProxy(webIdlCache), proxy);
    assert.equal(Reflect.get(proxy, 'URL'), URL);
}
