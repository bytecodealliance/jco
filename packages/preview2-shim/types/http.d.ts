import type { WasiHttpIncomingHandler } from './interfaces/wasi-http-incoming-handler.d.ts';
import type { WasiHttpOutgoingHandler } from './interfaces/wasi-http-outgoing-handler.d.ts';
import type { WasiHttpTypes } from './interfaces/wasi-http-types.d.ts';

export const incomingHandler: typeof WasiHttpIncomingHandler;
export const outgoingHandler: typeof WasiHttpOutgoingHandler;
export const types: typeof WasiHttpTypes;
