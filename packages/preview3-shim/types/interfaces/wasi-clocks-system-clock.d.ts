/** @module Interface wasi:clocks/system-clock@0.3.0-rc-2026-02-09 **/
/**
 * Read the current value of the clock.
 * 
 * This clock is not monotonic, therefore calling this function repeatedly
 * will not necessarily produce a sequence of non-decreasing values.
 * 
 * The nanoseconds field of the output is always less than 1000000000.
 */
export function now(): Instant;
/**
 * Query the resolution of the clock. Returns the smallest duration of time
 * that the implementation permits distinguishing.
 */
export function getResolution(): Duration;
export type Duration = import('./wasi-clocks-types.js').Duration;
/**
 * An "instant", or "exact time", is a point in time without regard to any
 * time zone: just the time since a particular external reference point,
 * often called an "epoch".
 * 
 * Here, the epoch is 1970-01-01T00:00:00Z, also known as
 * [POSIX's Seconds Since the Epoch], also known as [Unix Time].
 * 
 * Note that even if the seconds field is negative, incrementing
 * nanoseconds always represents moving forwards in time.
 * For example, `{ -1 seconds, 999999999 nanoseconds }` represents the
 * instant one nanosecond before the epoch.
 * For more on various different ways to represent time, see
 * https://tc39.es/proposal-temporal/docs/timezone.html
 * 
 * [POSIX's Seconds Since the Epoch]: https://pubs.opengroup.org/onlinepubs/9699919799/xrat/V4_xbd_chap04.html#tag_21_04_16
 * [Unix Time]: https://en.wikipedia.org/wiki/Unix_time
 */
export interface Instant {
  seconds: bigint,
  nanoseconds: number,
}
