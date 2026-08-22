export function testUrl(): boolean {
    const url = new URL('../report', 'https://example.com/examples/');
    return url.href === 'https://example.com/report';
}
