import * as tlsHost from "jco:node/tls@0.1.0";
import * as host from "jco:node/http2@0.1.0";

import { createHttp2 } from "./http2/core.js";
import { createDirectHttp2Implementation } from "./http2/impl/direct/index.js";

const implementation = createDirectHttp2Implementation(host, tlsHost);
const http2 = createHttp2(implementation);

export const http2Callbacks = implementation.http2Callbacks;

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
