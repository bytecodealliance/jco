export function testHeaders(): boolean {
    const headers = new Headers({ 'x-runtime': 'starlingmonkey' });
    headers.append('x-feature', 'headers');
    return headers.get('x-runtime') === 'starlingmonkey' && headers.get('x-feature') === 'headers';
}
