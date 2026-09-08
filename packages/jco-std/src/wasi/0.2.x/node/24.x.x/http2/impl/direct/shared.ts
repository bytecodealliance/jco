import { callHost } from "../../../internal/host-error.js";
import { bodyBytes } from "../../../http/body.js";
import { fromImplementationError } from "../../errors.js";
import type { DirectHttp2Result, Http2TlsMaterial } from "../../types.js";

export function unwrap<T>(operation: () => T | DirectHttp2Result<T>): T {
  return callHost(operation, fromImplementationError);
}

export function tlsBytes(value: Http2TlsMaterial | undefined): Uint8Array | undefined {
  return value === undefined ? undefined : bodyBytes(value);
}
