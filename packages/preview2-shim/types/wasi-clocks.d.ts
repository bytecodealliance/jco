export type MonotonicClock = number;
export type Instant = bigint;
export type WallClock = number;
export interface Datetime {
  seconds: bigint,
  nanoseconds: number,
}
export namespace WasiClocks {
  export function monotonicClockNow(clock: MonotonicClock): Instant;
  export function wallClockNow(clock: WallClock): Datetime;
}
