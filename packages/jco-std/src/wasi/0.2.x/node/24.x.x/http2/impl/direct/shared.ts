import { bodyBytes } from "../../../http/body.js";
import { fromImplementationError } from "../../errors.js";
import type { DirectHttp2Result, Http2TlsMaterial } from "../../types.js";

export function unwrap<T>(result: DirectHttp2Result<T>): T {
  if (result.tag === "err") {
    throw fromImplementationError(result.val);
  }
  return result.val;
}

export function tlsBytes(value: Http2TlsMaterial | undefined): Uint8Array | undefined {
  return value === undefined ? undefined : bodyBytes(value);
}
