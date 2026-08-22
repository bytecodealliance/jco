export async function testCompressionStream(): Promise<boolean> {
    const stream = new Blob(['Portable Web APIs: 🌐']).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return compressed.length > 2 && compressed[0] === 0x1f && compressed[1] === 0x8b;
}
