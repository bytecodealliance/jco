import type { WasiFilesystemPreopens } from './interfaces/wasi-filesystem-preopens.d.ts';
import type { WasiFilesystemTypes } from './interfaces/wasi-filesystem-types.d.ts';

export const preopens: typeof WasiFilesystemPreopens;
export const types: typeof WasiFilesystemTypes;
