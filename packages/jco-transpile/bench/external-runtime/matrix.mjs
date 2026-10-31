export function assertCompleteReports(expected, reports) {
    if (
        !Array.isArray(expected) ||
        !expected.length ||
        new Set(expected).size !== expected.length ||
        expected.toSorted().join() !== Object.keys(reports).toSorted().join()
    ) {
        throw new Error('Incomplete report matrix');
    }
}
