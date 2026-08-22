export function testRequest(): boolean {
    const request = new Request('https://example.com/data', {
        headers: { 'x-runtime': 'starlingmonkey' },
        method: 'POST',
    });
    return request.method === 'POST' && request.headers.get('x-runtime') === 'starlingmonkey';
}
