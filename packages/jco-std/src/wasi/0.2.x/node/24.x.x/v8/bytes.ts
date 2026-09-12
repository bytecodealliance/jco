import { invalidArgType } from "../errors/core.js";

export function bytes(value: unknown, name = "buffer"): Uint8Array {
  if (!ArrayBuffer.isView(value)) {
    throw invalidArgType(name, ["Buffer", "TypedArray", "DataView"], value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
