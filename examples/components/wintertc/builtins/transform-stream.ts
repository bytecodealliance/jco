export async function testTransformStream(): Promise<boolean> {
    const transform = new TransformStream<string, string>({
        transform(chunk: string, controller: TransformStreamDefaultController<string>): void {
            controller.enqueue(chunk.toUpperCase());
        },
    });
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const read = reader.read();
    await writer.write('transform');
    await writer.close();
    return (await read).value === 'TRANSFORM';
}
