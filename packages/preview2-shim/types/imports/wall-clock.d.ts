export namespace WallClock {
  export function now(this: WallClock): Datetime;
  export function resolution(this: WallClock): Datetime;
  export function dropWallClock(this: WallClock): void;
}
export type WallClock = number;
export interface Datetime {
  seconds: bigint,
  nanoseconds: number,
}
