import type * as WasiCli from "./cli.d.ts";
import type * as WasiClocks from './clocks.d.ts';
import type * as WasiFilesystem from './filesystem.d.ts';
import type * as WasiHttp from "./http.d.ts";
import type * as WasiIo from "./io.d.ts";
import type * as WasiRandom from "./random.d.ts";
import type * as WasiSockets from "./sockets.d.ts";

export const cli: typeof WasiCli;
export const clocks: typeof WasiClocks;
export const filesystem: typeof WasiFilesystem;
export const http: typeof WasiHttp;
export const io: typeof WasiIo;
export const random: typeof WasiRandom;
export const sockets: typeof WasiSockets;
