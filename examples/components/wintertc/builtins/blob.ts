export async function testBlob(): Promise<boolean> {
    const blob = new Blob(['portable', ' ', 'blob'], { type: 'text/plain' });
    return blob.type === 'text/plain' && (await blob.text()) === 'portable blob';
}
