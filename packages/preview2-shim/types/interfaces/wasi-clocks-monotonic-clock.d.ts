export namespace WasiClocksMonotonicClock {
  /**
   * Read the current value of the clock.
   * 
   * The clock is monotonic, therefore calling this function repeatedly will
   * produce a sequence of non-decreasing values.
   */
  export function now(): Instant;
  /**
   * Query the resolution of the clock.
   */
  export function resolution(): Instant;
  /**
   * Create a `pollable` which will resolve once the specified time has been
   * reached.
   */
  export function subscribe(when: Instant, absolute: boolean): Pollable;
}
import type { Pollable } from '../interfaces/wasi-io-poll.js';
export { Pollable };
/**
 * A timestamp in nanoseconds.
 */
export type Instant = bigint;
