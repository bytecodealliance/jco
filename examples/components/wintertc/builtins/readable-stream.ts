export async function testReadableStream(): Promise<boolean> {
    const stream = new ReadableStream<string>({
        start(controller: ReadableStreamDefaultController<string>): void {
            controller.enqueue('readable');
            controller.close();
        },
    });
    const reader = stream.getReader();
    const first = await reader.read();
    const second = await reader.read();
    return first.value === 'readable' && first.done === false && second.done === true;
}
