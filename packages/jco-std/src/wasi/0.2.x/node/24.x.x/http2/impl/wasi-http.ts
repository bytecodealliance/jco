import { unsupported } from "../errors.js";
import type { Http2Implementation } from "../types.js";

const REASON =
  "wasi:http/outgoing-handler exposes request exchanges, not HTTP/2 sessions, stream control, multiplexing, or arbitrary inbound servers";

/** A request-only WASI HTTP exchange cannot preserve node:http2 session identity. */
export function createWasiHttpHttp2Implementation(): Http2Implementation {
  return {
    unsupportedReason: REASON,
    connect: () => unsupported("http2.connect via wasi-http", REASON),
    createServer: () => unsupported("http2.createServer via wasi-http", REASON),
  };
}
