export function testTextDecoder(): boolean {
    const encoded = new Uint8Array([80, 111, 114, 116, 97, 98, 108, 101]);
    return new TextDecoder().decode(encoded) === 'Portable';
}
