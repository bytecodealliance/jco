export async function testFile(): Promise<boolean> {
    const file = new File(['portable file'], 'example.txt', {
        type: 'text/plain',
        lastModified: 123,
    });
    return (
        file.name === 'example.txt' &&
        file.type === 'text/plain' &&
        file.lastModified === 123 &&
        (await file.text()) === 'portable file'
    );
}
