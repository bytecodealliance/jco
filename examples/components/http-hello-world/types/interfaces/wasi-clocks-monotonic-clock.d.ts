export namespace WasiClocksMonotonicClock {
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
   * Create a `pollable` which will resolve once the specified instant
   * occured.
   */
  export function subscribeInstant(when: Instant): Pollable;
  /**
   * Create a `pollable` which will resolve once the given duration has
   * elapsed, starting at the time at which this function was called.
   * occured.
   */
  export function subscribeDuration(when: Duration): Pollable;
}
import type { Pollable } from './wasi-io-poll.js';
export { Pollable };
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
