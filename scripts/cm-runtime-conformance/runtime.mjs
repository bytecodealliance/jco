import assert from 'node:assert/strict';

export function testRuntimeApiVersion(runtime, expectedVersion) {
    assert.equal(runtime.CM_RUNTIME_API_VERSION, expectedVersion, 'runtime API version');
}

export async function testRuntimeExports({ load, runtime }) {
    const root = await load();
    assert.deepEqual(Object.keys(root), ['CM_RUNTIME_API_VERSION'], 'root runtime exports');
    assert.equal(root.CM_RUNTIME_API_VERSION, runtime.CM_RUNTIME_API_VERSION, 'root and runtime API versions agree');
}
