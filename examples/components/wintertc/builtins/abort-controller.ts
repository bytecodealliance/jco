export function testAbortController(): boolean {
    const controller = new AbortController();
    controller.abort('finished');
    return controller.signal.aborted && controller.signal.reason === 'finished';
}
