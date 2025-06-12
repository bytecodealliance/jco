/** @module Interface wasi:clocks/monotonic-clock@0.3.0 **/
/**
 * Read the current value of the clock.
 * 
 * The clock is monotonic, therefore calling this function repeatedly will
 * produce a sequence of non-decreasing values.
 */
export function now(): Instant;
/**
 * Query the resolution of the clock. Returns the duration of time
 * corresponding to a clock tick.
 */
export function resolution(): Duration;
/**
 * Wait until the specified instant has occurred.
 */
export async function waitUntil(when: Instant): void;
/**
 * Wait for the specified duration has elapsed.
 */
export async function waitFor(howLong: Duration): void;
/**
 * An instant in time, in nanoseconds. An instant is relative to an
 * unspecified initial value, and can only be compared to instances from
 * the same monotonic-clock.
 */
export type Instant = bigint;
/**
 * A duration of time, in nanoseconds.
 */
export type Duration = bigint;
