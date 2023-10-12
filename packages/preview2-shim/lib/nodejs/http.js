import { WasiHttp } from '../http/wasi-http.js';
import { _io } from './io.js';

const http = new WasiHttp(_io);
export const { incomingHandler, outgoingHandler, types } = http;
