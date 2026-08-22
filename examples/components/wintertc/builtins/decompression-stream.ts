const GZIP_JCO = new Uint8Array([31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 203, 74, 206, 7, 0, 73, 211, 220, 41, 3, 0, 0, 0]);

export async function testDecompressionStream(): Promise<boolean> {
    const stream = new Blob([GZIP_JCO]).stream().pipeThrough(new DecompressionStream('gzip'));
    return (await new Response(stream).text()) === 'jco';
}
