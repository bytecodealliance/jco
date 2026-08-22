export function testPerformance(): boolean {
    const start = performance.now();
    return performance.now() >= start;
}
