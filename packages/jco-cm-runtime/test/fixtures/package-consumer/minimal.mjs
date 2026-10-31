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
const { clampGuest, typeCheckValidI32, initializeTaskRegisters } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/core');
const { initializeStoreTrap, checkMayLeave } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/component');
const { initializeWaitableClass, initializeWaitableSetClass } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/waitable');
const { initializeLocalErrorContextTables, initializeErrorContextTableRegistrations } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/error-context');
if (initializeLocalErrorContextTables().size || Object.keys(initializeErrorContextTableRegistrations()).length) {
    throw new Error('error-context capability leak');
}
const Waitable = initializeWaitableClass(),
    WaitableSet = initializeWaitableSetClass({ TASK_CANCELLED: 3 });
const w = new Waitable({}),
    set = new WaitableSet(0);
w.join(set);
w.drop();
if (set.numWaitables() !== 0 || initializeWaitableClass() === Waitable) {
    throw new Error('waitable capability leak');
}
if (
    initializeStoreTrap().error !== null ||
    checkMayLeave({ RuntimeError: Error, instanceFlags: { get: () => ({ value: 1 }) } }, 0) !== undefined
) {
    throw new Error('component capability leak');
}
if (clampGuest(42, 0, 100) !== 42 || !typeCheckValidI32(42) || Object.keys(initializeTaskRegisters()).length) {
    throw new Error('core capability leak');
}
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
