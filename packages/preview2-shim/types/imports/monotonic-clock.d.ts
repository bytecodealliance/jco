export namespace MonotonicClock {
  export function now(this: MonotonicClock): Instant;
  export function resolution(this: MonotonicClock): Instant;
  export function subscribe(this: MonotonicClock, when: Instant, absolute: boolean): Pollable;
  export function dropMonotonicClock(this: MonotonicClock): void;
}
export type MonotonicClock = number;
export type Instant = bigint;
export type Pollable = Pollable;
