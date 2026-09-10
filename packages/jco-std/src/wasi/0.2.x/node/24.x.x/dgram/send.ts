/*
Copyright Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
/**
 * Adapted from nodejs/node lib/dgram.js (sliceBuffer, fixBufferList, send),
 * v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT.
 * License above. Local changes: typed unknown input and a single
 * copied WIT byte list after Node's overload and byte-offset normalization.
 */
import { Buffer } from "node:buffer";
import { codedError } from "../errors/core.js";
import { connected, invalidArgType, validatePort, validateString } from "./errors.js";
import type { SendCallback } from "./types.js";

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") {
    return Buffer.from(value);
  }
  if (!ArrayBuffer.isView(value)) {
    throw invalidArgType("buffer", ["Buffer", "TypedArray", "DataView", "string"], value);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function slice(value: unknown, offset: unknown, length: unknown): Uint8Array {
  const buffer = bytes(value);
  const start = (offset as number) >>> 0;
  const size = (length as number) >>> 0;
  if (start > buffer.byteLength || start + size > buffer.byteLength) {
    throw codedError(
      new RangeError(
        `"${start > buffer.byteLength ? "offset" : "length"}" is outside of buffer bounds`,
      ),
      "ERR_BUFFER_OUT_OF_BOUNDS",
    );
  }
  return buffer.subarray(start, start + size);
}

export function normalizeSend(
  isConnected: boolean,
  buffer: unknown,
  offset?: unknown,
  length?: unknown,
  port?: unknown,
  address?: unknown,
  callback?: unknown,
): { data: Uint8Array; port?: number; address?: string; callback?: SendCallback } {
  if (!isConnected) {
    if (address || (port && typeof port !== "function")) {
      buffer = slice(buffer, offset, length);
    } else {
      callback = port;
      port = offset;
      address = length;
    }
  } else {
    if (typeof length === "number") {
      buffer = slice(buffer, offset, length);
      if (typeof port === "function") {
        callback = port;
        port = undefined;
      }
    } else {
      callback = offset;
    }
    if (port || address) {
      throw connected();
    }
  }
  const list: Uint8Array[] = [];
  if (Array.isArray(buffer)) {
    for (let index = 0; index < buffer.length; index++) {
      const value: unknown = buffer[index];
      if (typeof value !== "string" && !ArrayBuffer.isView(value)) {
        throw invalidArgType(
          "buffer list arguments",
          ["Buffer", "TypedArray", "DataView", "string"],
          buffer,
        );
      }
      list.push(bytes(value));
    }
  } else {
    list.push(bytes(buffer));
  }
  const targetPort = isConnected ? undefined : validatePort(port);
  if (typeof callback !== "function") {
    callback = undefined;
  }
  if (typeof address === "function") {
    callback = address;
    address = undefined;
  } else if (address != null) {
    validateString(address, "address");
  }
  const data = new Uint8Array(list.reduce((size, part) => size + part.byteLength, 0));
  let position = 0;
  for (const part of list) {
    data.set(part, position);
    position += part.byteLength;
  }
  return {
    data,
    port: targetPort,
    address: address as string | undefined,
    callback: callback as SendCallback | undefined,
  };
}
