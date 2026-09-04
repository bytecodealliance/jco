import type { Http2Implementation } from "../../types.js";
import { createWasiHttpHttp2Client } from "./client.js";
import { createWasiHttpHttp2Server } from "./server.js";
import { UNSUPPORTED_REASON } from "./shared.js";

/** A request-only WASI HTTP exchange cannot preserve node:http2 session identity. */
export function createWasiHttpHttp2Implementation(): Http2Implementation {
  return {
    unsupportedReason: UNSUPPORTED_REASON,
    connect: createWasiHttpHttp2Client,
    createServer: createWasiHttpHttp2Server,
  };
}
