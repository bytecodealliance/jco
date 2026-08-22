export async function testWritableStream(): Promise<boolean> {
    const chunks: string[] = [];
    const stream = new WritableStream<string>({
        write(chunk: string): void {
            chunks.push(chunk);
        },
    });
    const writer = stream.getWriter();
    await writer.write('writable');
    await writer.close();
    return chunks.join('') === 'writable';
}
