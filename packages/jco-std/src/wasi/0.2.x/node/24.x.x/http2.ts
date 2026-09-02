import * as host from "jco:node/http2@0.1.0";

import { createHttp2 } from "./http2/core.js";
import { createDirectHttp2Implementation, http2Callbacks } from "./http2/impl/direct.js";

const http2 = createHttp2(createDirectHttp2Implementation(host));

export { http2Callbacks };

export const connect = http2.connect;
export const constants = http2.constants;
export const createServer = http2.createServer;
export const createSecureServer = http2.createSecureServer;
export const getDefaultSettings = http2.getDefaultSettings;
export const getPackedSettings = http2.getPackedSettings;
export const getUnpackedSettings = http2.getUnpackedSettings;
export const performServerHandshake = http2.performServerHandshake;
export const sensitiveHeaders = http2.sensitiveHeaders;
export const Http2ServerRequest = http2.Http2ServerRequest;
export const Http2ServerResponse = http2.Http2ServerResponse;

export default http2;
