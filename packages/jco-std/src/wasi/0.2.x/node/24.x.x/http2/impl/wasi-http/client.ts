import { unsupported } from "../../errors.js";
import type { Http2ClientSessionImplementation } from "../../types.js";
import { UNSUPPORTED_REASON } from "./shared.js";

export function createWasiHttpHttp2Client(): Http2ClientSessionImplementation {
  return unsupported("http2.connect via wasi-http", UNSUPPORTED_REASON);
}
