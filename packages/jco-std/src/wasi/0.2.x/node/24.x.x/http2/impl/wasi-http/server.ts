import { unsupported } from "../../errors.js";
import type { Http2ServerImplementation } from "../../types.js";
import { UNSUPPORTED_REASON } from "./shared.js";

export function createWasiHttpHttp2Server(): Http2ServerImplementation {
  return unsupported("http2.createServer via wasi-http", UNSUPPORTED_REASON);
}
