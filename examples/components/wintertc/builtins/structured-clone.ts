type Cloneable = {
    nested: { value: number };
    bytes: Uint8Array;
};

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function testStructuredClone(): boolean {
    const original: Cloneable = { nested: { value: 42 }, bytes: new Uint8Array([1, 2, 3]) };
    const cloned = structuredClone(original);
    cloned.nested.value = 7;
    return original.nested.value === 42 && cloned.nested.value === 7 && bytesEqual(cloned.bytes, original.bytes);
}
