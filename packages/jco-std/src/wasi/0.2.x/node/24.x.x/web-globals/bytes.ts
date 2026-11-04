import { TextEncoder } from "../text-encoding.js";
export const encode = (value: unknown): Uint8Array<ArrayBuffer> =>
  typeof value === "string"
    ? new Uint8Array(new TextEncoder().encode(value))
    : value instanceof ArrayBuffer
      ? new Uint8Array(value.slice(0))
      : ArrayBuffer.isView(value)
        ? new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
        : new Uint8Array(new TextEncoder().encode(String(value)));
