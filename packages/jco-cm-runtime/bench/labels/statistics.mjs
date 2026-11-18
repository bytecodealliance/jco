/**
 * Compute the median of a nonempty series of timings or speedup ratios.
 * @param {number[]} values - observations from one workload
 * @returns {number} median observation
 */
export function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
