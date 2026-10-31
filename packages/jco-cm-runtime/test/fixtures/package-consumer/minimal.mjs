for (const key of [
    'WebAssembly',
    'TextEncoder',
    'TextDecoder',
    'DataView',
    'Proxy',
    'Symbol',
    'Int32Array',
    'Float32Array',
    'BigInt64Array',
    'Float64Array',
]) {
    Object.defineProperty(globalThis, key, {
        get() {
            throw new Error('unexpected capability: ' + key);
        },
    });
}
await import('@bytecodealliance/jco-cm-runtime/runtime');
const { tableGet } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/resource');
const { toUint32, toString } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/conversion');
const { emptyFunc } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/js-helper');
const { validateGuestChar, utf16ValidatingCopy } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/string');
const { initializeWebIdlProxyCache } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/webidl');
if (initializeWebIdlProxyCache().proxy !== undefined) {
    throw new Error('eager WebIDL proxy');
}
if (validateGuestChar(0x1f680) !== '🚀' || !utf16ValidatingCopy(new Uint16Array([97]), new Uint16Array(1))) {
    throw new Error('string capability leak');
}
if (emptyFunc(42) !== undefined) {
    throw new Error('empty function capability leak');
}
if (toUint32({ strict: false }, '42') !== 42 || toString(42) !== '42') {
    throw new Error('scalar capability leak');
}
const entry = tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 42], 1);
if (entry.rep !== 42) {
    throw new Error('bad entry');
}
