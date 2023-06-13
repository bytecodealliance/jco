export namespace ClocksMonotonicClock {
  export function /**
   * Read the current value of the clock.
   * 
   * The clock is monotonic, therefore calling this function repeatedly will
   * produce a sequence of non-decreasing values.
   */
  now(): Instant;
  export function /**
   * Query the resolution of the clock.
   */
  resolution(): Instant;
  export function /**
   * Create a `pollable` which will resolve once the specified time has been
   * reached.
   */
  subscribe(when: Instant, absolute: boolean): Pollable;
}
import type { Pollable } from '../imports/poll';
export { Pollable };
/**
 * A timestamp in nanoseconds.
 */
export type Instant = bigint;
