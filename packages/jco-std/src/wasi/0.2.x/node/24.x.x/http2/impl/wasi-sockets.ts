import { unsupported } from "../errors.js";
import type { Http2Implementation } from "../types.js";

const REASON =
  "Preview 2 wasi:sockets supplies TCP only; a faithful h2c implementation also requires HTTP/2 framing, HPACK, multiplexing, and flow control";

/**
 * HTTP/1 framing cannot be reused here: sending HTTP/1-shaped bytes would be a
 * protocol facade, not h2c. Reject before opening a socket until those protocol
 * layers are implemented.
 */
export function createWasiSocketsHttp2Implementation(): Http2Implementation {
  return {
    unsupportedReason: REASON,
    connect: () => unsupported("http2.connect via wasi-sockets", REASON),
    createServer: () => unsupported("http2.createServer via wasi-sockets", REASON),
  };
}
