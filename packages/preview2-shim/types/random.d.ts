import type { WasiRandomInsecureSeed } from './interfaces/wasi-random-insecure-seed.d.ts';
import type { WasiRandomInsecure } from './interfaces/wasi-random-insecure.d.ts';
import type { WasiRandomRandom } from './interfaces/wasi-random-random.d.ts';

export const insecureSeed: typeof WasiRandomInsecureSeed;
export const insecure: typeof WasiRandomInsecure;
export const random: typeof WasiRandomRandom;
