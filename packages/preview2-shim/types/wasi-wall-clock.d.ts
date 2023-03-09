export type WallClock = number;
export interface Datetime {
  seconds: bigint,
  nanoseconds: number,
}
export namespace WasiClocks {
  export function now(clock: WallClock): Datetime;
  export function resolution(clock: WallClock): Datetime;
}
