export type MonotonicClock = MonotonicClock;
export type WallClock = WallClock;
export namespace WasiDefaultClocks {
  export function defaultMonotonicClock(): MonotonicClock;
  export function defaultWallClock(): WallClock;
}
