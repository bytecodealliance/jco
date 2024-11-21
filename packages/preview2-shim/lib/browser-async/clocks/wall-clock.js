// wasi:clocks/wall-clock@0.2.0 interface

/**
 * A time and date in seconds plus nanoseconds.
 *
 * @typdef{{seconds: bigint, nanoseconds: number}} Datetime
 */

/**
 * Read the current value of the clock.
 * 
 * This clock is not monotonic, therefore calling this function repeatedly will
 * not necessarily produce a sequence of non-decreasing values.
 * 
 * The returned timestamps represent the number of seconds since
 * 1970-01-01T00:00:00Z, also known as POSIX's Seconds Since the Epoch, also
 * known as Unix Time.
 * 
 * The nanoseconds field of the output is always less than 1000000000.
 *
 * @returns {Datetime}
 */
export const now = () => {
    const now = Date.now(); // in milliseconds
    const seconds = BigInt(Math.floor(now / 1e3));
    const nanoseconds = (now % 1e3) * 1e6;
    return { seconds, nanoseconds };
};

/**
 * Query the resolution of the clock.
 *
 * The nanoseconds field of the output is always less than 1000000000.
 *
 * @returns {Datetime}
 */
export const resolution = () => {
  return { seconds: 0n, nanoseconds: 1e6 };
};
