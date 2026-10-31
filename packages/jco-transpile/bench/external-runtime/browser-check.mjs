// The browser runs the same workload checks; it needs only these two strict
// assertions instead of Node's assertion module.
export function equal(actual, expected, message = 'values differ') {
    if (!Object.is(actual, expected)) {
        throw new Error(message);
    }
}
export function deepEqual(actual, expected, message = 'structures differ') {
    if (Object.is(actual, expected)) {
        return;
    }
    if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') {
        throw new Error(message);
    }
    if (ArrayBuffer.isView(actual) || ArrayBuffer.isView(expected)) {
        equal(actual.constructor.name, expected.constructor.name, message);
        equal(actual.byteLength, expected.byteLength, message);
        const a = new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength),
            b = new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength);
        for (let i = 0; i < a.length; i++) {
            equal(a[i], b[i], message);
        }
        return;
    }
    const keys = Object.keys(actual).sort(),
        wanted = Object.keys(expected).sort();
    equal(keys.length, wanted.length, message);
    for (let i = 0; i < keys.length; i++) {
        equal(keys[i], wanted[i], message);
        deepEqual(actual[keys[i]], expected[keys[i]], message);
    }
}
export default { equal, deepEqual };
