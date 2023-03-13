export type MonotonicClock = number;
export type Instant = bigint;
export namespace MonotonicClock {
  export function now(clock: MonotonicClock): Instant;
  export function resolution(clock: MonotonicClock): Instant;
}
