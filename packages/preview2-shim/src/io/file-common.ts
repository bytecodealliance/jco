/** Reads up to this length are attempted as requested, without a look at the file. */
export const UNCHECKED_READ_LENGTH = 64 * 1024;

/** The most one read returns. A guest that wants more reads again. */
export const MAX_READ_LENGTH = 2 ** 30;

/**
 * Bound the length of a large read by what the file can supply.
 *
 * A guest may ask for any u64 number of bytes, for example to read "the rest"
 * of a file, and the buffer for the answer is allocated before the read. The
 * answer may be shorter than the request, so the buffer only has to hold what
 * a regular file has left after the offset. Files that report no size, such as
 * devices and some virtual files, get the unchecked length.
 *
 * @param length - the requested length
 * @param offset - the offset the read starts at
 * @param stats - the file, as `fstat` describes it
 * @returns a length of at least one unchecked read and at most the request
 */
export function boundedReadLength(
    length: number,
    offset: number,
    stats: { isFile(): boolean; size: number | bigint },
): number {
    const remaining = stats.isFile() ? Number(stats.size) - offset : 0;
    return Math.min(length, MAX_READ_LENGTH, Math.max(remaining, UNCHECKED_READ_LENGTH));
}
