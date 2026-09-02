// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Adapted from nodejs/node v24.20.0 lib/string_decoder.js and
// lib/internal/util.js at commit 71b8b174857e25106d39b61a9e6f30d927da8b01,
// plus the portable algorithms from nodejs/string_decoder 1.1.1. Node's
// internal native decoder state is replaced by typed guest-local state and
// the existing Jco node:buffer implementation.
import { Buffer } from "node:buffer";

import { codedError, invalidArgType } from "./errors.js";

export type StringDecoderEncoding =
  | "ascii"
  | "base64"
  | "base64url"
  | "hex"
  | "latin1"
  | "utf16le"
  | "utf8";

export type StringDecoderInputEncoding =
  | StringDecoderEncoding
  | "binary"
  | "ucs-2"
  | "ucs2"
  | "utf-16le"
  | "utf-8";

export type StringDecoderInput = string | ArrayBufferView;

interface DecoderState {
  lastChar: Buffer;
  lastNeed: number;
  lastTotal: number;
}

const kNativeDecoder = Symbol("kNativeDecoder");

function lower(value: unknown): string {
  return String.prototype.toLowerCase.call(value);
}

// Kept structurally aligned with Node's normalizeEncoding()/slowCases().
function normalizeEncoding(encoding: unknown): StringDecoderEncoding | undefined {
  if (encoding == null || encoding === "utf8" || encoding === "utf-8") {
    return "utf8";
  }

  const length = (encoding as { length?: unknown }).length;
  switch (length) {
    case 4:
      if (encoding === "UTF8") {
        return "utf8";
      }
      if (encoding === "ucs2" || encoding === "UCS2") {
        return "utf16le";
      }
      if (lower(encoding) === "utf8") {
        return "utf8";
      }
      if (lower(encoding) === "ucs2") {
        return "utf16le";
      }
      break;
    case 3:
      if (encoding === "hex" || encoding === "HEX" || lower(encoding) === "hex") {
        return "hex";
      }
      break;
    case 5:
      if (encoding === "ascii" || encoding === "ASCII") {
        return "ascii";
      }
      if (encoding === "ucs-2" || encoding === "UCS-2") {
        return "utf16le";
      }
      if (encoding === "UTF-8") {
        return "utf8";
      }
      if (lower(encoding) === "utf-8") {
        return "utf8";
      }
      if (lower(encoding) === "ascii") {
        return "ascii";
      }
      if (lower(encoding) === "ucs-2") {
        return "utf16le";
      }
      break;
    case 6:
      if (encoding === "base64" || encoding === "BASE64") {
        return "base64";
      }
      if (encoding === "latin1" || encoding === "LATIN1") {
        return "latin1";
      }
      if (encoding === "binary" || encoding === "BINARY") {
        return "latin1";
      }
      if (lower(encoding) === "base64") {
        return "base64";
      }
      if (lower(encoding) === "latin1" || lower(encoding) === "binary") {
        return "latin1";
      }
      break;
    case 7:
      if (encoding === "utf16le" || encoding === "UTF16LE" || lower(encoding) === "utf16le") {
        return "utf16le";
      }
      break;
    case 8:
      if (encoding === "utf-16le" || encoding === "UTF-16LE" || lower(encoding) === "utf-16le") {
        return "utf16le";
      }
      break;
    case 9:
      if (encoding === "base64url" || encoding === "BASE64URL" || lower(encoding) === "base64url") {
        return "base64url";
      }
      break;
    default:
      if (encoding === "") {
        return "utf8";
      }
  }
  return undefined;
}

function unknownEncoding(encoding: unknown): Error {
  return codedError(new TypeError(`Unknown encoding: ${String(encoding)}`), "ERR_UNKNOWN_ENCODING");
}

function invalidThis(): Error {
  return codedError(
    new TypeError('Value of "this" must be of type StringDecoder'),
    "ERR_INVALID_THIS",
  );
}

function inputBytes(input: ArrayBufferView): Buffer {
  return Buffer.from(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
}

function encodeBytes(
  input: Buffer,
  encoding: StringDecoderEncoding,
  start = 0,
  end = input.length,
): string {
  if (encoding === "base64url") {
    return input
      .toString("base64", start, end)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
  }
  return input.toString(encoding, start, end);
}

function utf8CheckByte(byte: number): number {
  if (byte <= 0x7f) {
    return 0;
  }
  if (byte >> 5 === 0x06) {
    return 2;
  }
  if (byte >> 4 === 0x0e) {
    return 3;
  }
  if (byte >> 3 === 0x1e) {
    return 4;
  }
  return byte >> 6 === 0x02 ? -1 : -2;
}

function utf8CheckIncomplete(state: DecoderState, input: Buffer, start: number): number {
  let index = input.length - 1;
  if (index < start) {
    return 0;
  }
  let bytes = utf8CheckByte(input[index]);
  if (bytes >= 0) {
    if (bytes > 0) {
      state.lastNeed = bytes - 1;
    }
    return bytes;
  }
  if (--index < start || bytes === -2) {
    return 0;
  }
  bytes = utf8CheckByte(input[index]);
  if (bytes >= 0) {
    if (bytes > 0) {
      state.lastNeed = bytes - 2;
    }
    return bytes;
  }
  if (--index < start || bytes === -2) {
    return 0;
  }
  bytes = utf8CheckByte(input[index]);
  if (bytes >= 0) {
    if (bytes > 0) {
      if (bytes === 2) {
        bytes = 0;
      } else {
        state.lastNeed = bytes - 3;
      }
    }
    return bytes;
  }
  return 0;
}

function fillLast(
  state: DecoderState,
  input: Buffer,
  encoding: StringDecoderEncoding,
): string | undefined {
  if (state.lastNeed <= input.length) {
    input.copy(state.lastChar, state.lastTotal - state.lastNeed, 0, state.lastNeed);
    return encodeBytes(state.lastChar, encoding, 0, state.lastTotal);
  }
  input.copy(state.lastChar, state.lastTotal - state.lastNeed, 0, input.length);
  state.lastNeed -= input.length;
  return undefined;
}

function utf8Text(state: DecoderState, input: Buffer, start: number): string {
  const total = utf8CheckIncomplete(state, input, start);
  if (state.lastNeed === 0) {
    return input.toString("utf8", start);
  }
  state.lastTotal = total;
  const end = input.length - (total - state.lastNeed);
  input.copy(state.lastChar, 0, end);
  return input.toString("utf8", start, end);
}

function utf8Write(state: DecoderState, input: Buffer): string {
  const buffered = state.lastTotal - state.lastNeed;
  const bytes = buffered > 0 ? Buffer.concat([state.lastChar.subarray(0, buffered), input]) : input;
  state.lastNeed = 0;
  state.lastTotal = 0;
  return utf8Text(state, bytes, 0);
}

function utf16Text(state: DecoderState, input: Buffer, start: number): string {
  if ((input.length - start) % 2 === 0) {
    const result = input.toString("utf16le", start);
    if (result) {
      const code = result.charCodeAt(result.length - 1);
      if (code >= 0xd800 && code <= 0xdbff) {
        state.lastNeed = 2;
        state.lastTotal = 4;
        state.lastChar[0] = input[input.length - 2];
        state.lastChar[1] = input[input.length - 1];
        return result.slice(0, -1);
      }
    }
    return result;
  }
  state.lastNeed = 1;
  state.lastTotal = 2;
  state.lastChar[0] = input[input.length - 1];
  return input.toString("utf16le", start, input.length - 1);
}

function base64Text(
  state: DecoderState,
  input: Buffer,
  start: number,
  encoding: "base64" | "base64url",
): string {
  const remainder = (input.length - start) % 3;
  if (remainder === 0) {
    return encodeBytes(input, encoding, start);
  }
  state.lastNeed = 3 - remainder;
  state.lastTotal = 3;
  if (remainder === 1) {
    state.lastChar[0] = input[input.length - 1];
  } else {
    state.lastChar[0] = input[input.length - 2];
    state.lastChar[1] = input[input.length - 1];
  }
  return encodeBytes(input, encoding, start, input.length - remainder);
}

/** A guest-local implementation of Node's streaming string decoder. */
export class StringDecoder {
  encoding: StringDecoderEncoding;
  private [kNativeDecoder]: DecoderState;

  constructor(encoding?: StringDecoderInputEncoding) {
    const normalized = normalizeEncoding(encoding);
    if (normalized === undefined) {
      throw unknownEncoding(encoding);
    }
    this.encoding = normalized;
    this[kNativeDecoder] = {
      lastChar: Buffer.alloc(4),
      lastNeed: 0,
      lastTotal: 0,
    };
  }

  write(input: StringDecoderInput): string {
    if (typeof input === "string") {
      return input;
    }
    if (!ArrayBuffer.isView(input)) {
      throw invalidArgType("buf", ["Buffer", "TypedArray", "DataView"], input);
    }
    const state = this?.[kNativeDecoder];
    if (!state) {
      throw invalidThis();
    }
    const bytes = inputBytes(input);
    if (bytes.length === 0) {
      return "";
    }

    if (this.encoding === "utf8") {
      return utf8Write(state, bytes);
    }

    let prefix: string | undefined;
    let start = 0;
    if (state.lastNeed > 0) {
      prefix = fillLast(state, bytes, this.encoding);
      if (prefix === undefined) {
        return "";
      }
      start = state.lastNeed;
      state.lastNeed = 0;
      state.lastTotal = 0;
    }

    let decoded = "";
    if (start < bytes.length) {
      switch (this.encoding) {
        case "utf16le":
          decoded = utf16Text(state, bytes, start);
          break;
        case "base64":
        case "base64url":
          decoded = base64Text(state, bytes, start, this.encoding);
          break;
        default:
          decoded = encodeBytes(bytes, this.encoding, start);
      }
    }
    return prefix ? prefix + decoded : decoded;
  }

  end(input?: StringDecoderInput): string {
    const result = input === undefined ? "" : this.write(input);
    const state = this[kNativeDecoder];
    if (state.lastNeed === 0) {
      return result;
    }

    let trailing = "";
    switch (this.encoding) {
      case "utf8":
        trailing = state.lastChar.toString("utf8", 0, state.lastTotal - state.lastNeed);
        break;
      case "utf16le":
        trailing = state.lastChar.toString("utf16le", 0, state.lastTotal - state.lastNeed);
        break;
      case "base64":
      case "base64url":
        trailing = encodeBytes(state.lastChar, this.encoding, 0, state.lastTotal - state.lastNeed);
        break;
    }
    state.lastNeed = 0;
    state.lastTotal = 0;
    return result + trailing;
  }

  /** Undocumented legacy method retained by Node 24. */
  text(input: StringDecoderInput, offset: number): string {
    const state = this[kNativeDecoder];
    state.lastNeed = 0;
    state.lastTotal = 0;
    if (typeof input === "string") {
      return this.write(input.slice(offset));
    }
    if (!ArrayBuffer.isView(input)) {
      throw invalidArgType("buf", ["Buffer", "TypedArray", "DataView"], input);
    }
    const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength).subarray(offset);
    return this.write(bytes);
  }

  /** Undocumented legacy buffered-byte view retained by Node 24. */
  get lastChar(): Buffer {
    const state = this?.[kNativeDecoder];
    if (!state) {
      throw invalidThis();
    }
    return state.lastChar.subarray(0, 4);
  }

  /** Undocumented legacy count retained by Node 24. */
  get lastNeed(): number {
    const state = this?.[kNativeDecoder];
    if (!state) {
      throw invalidThis();
    }
    return state.lastNeed;
  }

  /** Undocumented legacy count retained by Node 24. */
  get lastTotal(): number {
    const state = this?.[kNativeDecoder];
    if (!state) {
      throw invalidThis();
    }
    return state.lastTotal;
  }
}

for (const name of ["write", "end", "text", "lastChar", "lastNeed", "lastTotal"] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(StringDecoder.prototype, name);
  if (descriptor) {
    Object.defineProperty(StringDecoder.prototype, name, { ...descriptor, enumerable: true });
  }
}

const stringDecoder = { StringDecoder };

export default stringDecoder;
