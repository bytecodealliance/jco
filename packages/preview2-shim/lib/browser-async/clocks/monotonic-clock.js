// wasi:clocks/monotonic-clock@0.2.0 interface

import { Pollable } from "../io/poll.js";

/**
 * An instant in time, in nanoseconds. An instant is relative to an unspecified
 * initial value, and can only be compared to instances from the same monotonic-clock.
 *
 * @typedef {bigint} Instant
 */

/**
 * A duration of time, in nanoseconds.
 *
 * @typedef {bigint} Duration
 */

/**
 * Read the current value of the clock.
 *
 * The clock is monotonic, therefore calling this function repeatedly will produce a
 * sequence of non-decreasing values.
 *
 * @returns {Instant}
 */
export const now = () => {
  // performance.now() is in milliseconds, convert to nanoseconds
  return BigInt(Math.floor(performance.now() * 1e6));
};

/**
 * Query the resolution of the clock. Returns the duration of time corresponding to a
 * clock tick.
 *
 * @returns {Duration}
 */
export const resolution = () => {
    // millisecond accuracy
    return BigInt(1e6);
};

/**
 * Create a `Pollable` which will resolve once the specified instant occured.
 *
 * @param {Instant} when
 * @returns {Pollable}
 */
export const subscribeInstant = (when) => subscribeDuration(when - now());

/**
 * Create a `Pollable` which will resolve once the given duration has elapsed, starting
 * at the time at which this function was called. occured.
 *
 * Implemented with `setTimeout` that is specified in millisecond resolution.
 *
 * @param {Duration} when
 * @returns {Pollable}
 */
export const subscribeDuration = (when) => {
  if (when < 0) return new Pollable();
  return new Pollable(
    new Promise((resolve) => {
      setTimeout(resolve, Math.ceil(Number(when) / 1e6));
    }),
  );
};
