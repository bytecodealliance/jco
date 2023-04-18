export namespace MonotonicClock {
  export function now(): Instant;
  export function resolution(): Instant;
  export function subscribe(when: Instant, absolute: boolean): Pollable;
}
export type Instant = bigint;
import type { Pollable } from '../imports/poll';
export { Pollable };
