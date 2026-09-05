import { invalidArgType, invalidArgValue } from "../errors/core.js";

export type ByteChunk = string | ArrayBuffer | ArrayBufferView;

/** Convert the byte-like chunk accepted by Node stream and protocol APIs. */
export function bodyBytes(value: ByteChunk, encoding = "utf8"): Uint8Array {
  if (typeof value === "string") {
    const normalized = encoding.toLowerCase().replace("-", "");
    if (normalized === "utf8" || normalized === "utf") {
      return new TextEncoder().encode(value);
    }
    if (normalized === "latin1" || normalized === "binary" || normalized === "ascii") {
      return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
    }
    throw invalidArgValue("encoding", encoding);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }
  throw invalidArgType("chunk", "string, Buffer, TypedArray, or DataView", value);
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
