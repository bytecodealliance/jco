import type { WasiIoError } from './interfaces/wasi-io-error.d.ts';
import type { WasiIoPoll } from './interfaces/wasi-io-poll.d.ts';
import type { WasiIoStreams } from './interfaces/wasi-io-streams.d.ts';

export const error: typeof WasiIoError;
export const poll: typeof WasiIoPoll;
export const streams: typeof WasiIoStreams;
