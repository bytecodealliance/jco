export type MonotonicClock = MonotonicClock;
export type WallClock = WallClock;
export namespace DefaultClocks {
  export function defaultMonotonicClock(): MonotonicClock;
  export function defaultWallClock(): WallClock;
}
