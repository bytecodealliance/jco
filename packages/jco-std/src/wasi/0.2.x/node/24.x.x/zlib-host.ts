import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { ZlibProvider, ZlibError, Engine as EngineType, Output } from "./zlib/types.js";
function denied(): never {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:zlib"),
    code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED",
  } satisfies ZlibError;
}
export const open: ZlibProvider["open"] = denied;
export const compress: ZlibProvider["compress"] = denied;
export const crc32: ZlibProvider["crc32"] = denied;
export class Engine implements EngineType {
  constructor() {
    denied();
  }
  write(_data: Uint8Array): Output {
    return denied();
  }
  finish(): Output {
    return denied();
  }
  flush(_kind: number): Output {
    return denied();
  }
  params(_level: number, _strategy: number): Output {
    return denied();
  }
  reset(): void {
    denied();
  }
  close(): void {
    denied();
  }
}
const host: ZlibProvider = { open, compress, crc32 };
export default host;
