import { WasiHttp } from '../http/wasi-http.js';
import { streams } from '../common/io.js';

const http = new WasiHttp(streams);
export const { incomingHandler, outgoingHandler, types } = http;
