import { invalidArgType, invalidArgValue } from "./errors.js";
import type { HttpBodyChunk } from "./types.js";

export function bodyBytes(value: HttpBodyChunk, encoding = "utf8"): Uint8Array {
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

export function base64(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new TextEncoder().encode(value);
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 63];
  }
  return output;
}
