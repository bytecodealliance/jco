import type { WasiClocksMonotonicClock } from './interfaces/wasi-clocks-monotonic-clock.d.ts';
import type { WasiClocksWallClock } from './interfaces/wasi-clocks-wall-clock.d.ts';

export const wallClock: typeof WasiClocksMonotonicClock;
export const monotonicClock: typeof WasiClocksWallClock;
