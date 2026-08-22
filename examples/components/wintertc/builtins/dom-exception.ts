export function testDomException(): boolean {
    const exception = new DOMException('portable', 'DataError');
    return exception.name === 'DataError' && exception.message === 'portable';
}
