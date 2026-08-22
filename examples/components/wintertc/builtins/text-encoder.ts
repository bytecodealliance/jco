const PORTABLE_BYTES = new Uint8Array([80, 111, 114, 116, 97, 98, 108, 101]);

export function testTextEncoder(): boolean {
    const encoded = new TextEncoder().encode('Portable');
    return encoded.length === PORTABLE_BYTES.length && encoded.every((byte, index) => byte === PORTABLE_BYTES[index]);
}
