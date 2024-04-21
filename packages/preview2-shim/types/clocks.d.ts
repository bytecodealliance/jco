import type { WasiClocksMonotonicClock } from './interfaces/wasi-clocks-monotonic-clock.d.ts';
import type { WasiClocksWallClock } from './interfaces/wasi-clocks-wall-clock.d.ts';

export const wallClock: typeof WasiClocksWallClock;
export const monotonicClock: typeof WasiClocksMonotonicClock;
