/**
 * Summarize nanosecond observations without hiding their spread.
 * @param {number[]} samples - one or more finite timings
 * @returns {{min: number, median: number, max: number}} timings in nanoseconds
 */
export function summarize(samples) {
    if (samples.length === 0 || samples.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('expected positive finite timing samples');
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return {
        min: sorted[0],
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        max: sorted.at(-1),
    };
}
