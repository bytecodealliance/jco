/**
 * Portable byte-stream helpers shared by Node's consumers and iterable APIs.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/stream/consumers.js and lib/internal/streams/iter/{utils,consumers}.js
 * (MIT license). Local changes use public typed-array/Web APIs and jco-std's
 * portable Node error helpers instead of primordials and internal bindings.
 */

import { invalidArgType, invalidArgValue, outOfRange } from "../errors/core.js";

import type {
  ConsumeOptions,
  ConsumeSyncOptions,
  TextConsumeOptions,
  TextConsumeSyncOptions,
} from "./iter/types.js";

const encoder = new TextEncoder();

export function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObject(value) && typeof value.then === "function";
}

export function isSyncIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value !== "string" && isObject(value) && typeof value[Symbol.iterator] === "function"
  );
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isObject(value) && typeof value[Symbol.asyncIterator] === "function";
}

export function isArrayBufferLike(value: unknown): value is ArrayBufferLike {
  return (
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)
  );
}

export function isPrimitiveChunk(
  value: unknown,
): value is string | ArrayBufferLike | ArrayBufferView {
  return typeof value === "string" || isArrayBufferLike(value) || ArrayBuffer.isView(value);
}

export function primitiveToUint8Array(
  value: string | ArrayBufferLike | ArrayBufferView,
): Uint8Array {
  if (typeof value === "string") {
    return encoder.encode(value);
  }
  if (isArrayBufferLike(value)) {
    return new Uint8Array(value);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function toUint8Array(value: unknown, name = "chunk"): Uint8Array {
  if (!isPrimitiveChunk(value)) {
    throw invalidArgType(name, ["string", "ArrayBuffer", "ArrayBufferView"], value);
  }
  return primitiveToUint8Array(value);
}

export function copyBytes(value: Uint8Array): Uint8Array {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    const chunk = chunks[0];
    if (
      chunk.byteOffset === 0 &&
      chunk.byteLength === chunk.buffer.byteLength &&
      !(typeof SharedArrayBuffer !== "undefined" && chunk.buffer instanceof SharedArrayBuffer)
    ) {
      return chunk;
    }
    return copyBytes(chunk);
  }
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer;
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength &&
    buffer instanceof ArrayBuffer
  ) {
    // TypeScript models `Uint8Array#buffer` as `ArrayBufferLike` even after
    // the runtime constructor check, so return a precisely typed view here.
    return new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength).slice().buffer;
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function validateAbortSignal(
  signal: unknown,
  name = "options.signal",
): asserts signal is AbortSignal | undefined {
  if (
    signal !== undefined &&
    (!isObject(signal) ||
      typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function" ||
      typeof signal.throwIfAborted !== "function")
  ) {
    throw invalidArgType(name, "AbortSignal", signal);
  }
}

export function validateLimit(
  limit: unknown,
  name = "options.limit",
): asserts limit is number | undefined {
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 0)) {
    throw outOfRange(name, ">= 0 and an integer", limit);
  }
}

export function validateEncoding(encoding: unknown): asserts encoding is string | undefined {
  if (encoding !== undefined && typeof encoding !== "string") {
    throw invalidArgType("options.encoding", "string", encoding);
  }
  if (encoding !== undefined) {
    try {
      new TextDecoder(encoding);
    } catch {
      throw invalidArgValue("options.encoding", encoding);
    }
  }
}

function validateOptionsObject(value: unknown): asserts value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") {
    throw invalidArgType("options", "Object", value);
  }
}

export function validateConsumeOptions(options: ConsumeOptions | TextConsumeOptions): void {
  validateOptionsObject(options);
  validateLimit(options.limit);
  validateAbortSignal(options.signal);
  if ("encoding" in options) {
    validateEncoding(options.encoding);
  }
}

export function validateSyncConsumeOptions(
  options: ConsumeSyncOptions | TextConsumeSyncOptions,
): void {
  validateOptionsObject(options);
  validateLimit(options.limit);
  if ("encoding" in options) {
    validateEncoding(options.encoding);
  }
}

export function addByteLength(total: number, chunk: Uint8Array, limit?: number): number {
  const next = total + chunk.byteLength;
  if (limit !== undefined && next > limit) {
    throw outOfRange("totalBytes", `<= ${limit}`, next);
  }
  return next;
}

export async function abortableNext<T>(
  iterator: AsyncIterator<T>,
  signal?: AbortSignal,
): Promise<IteratorResult<T>> {
  if (signal === undefined) {
    return iterator.next();
  }
  signal.throwIfAborted();
  let remove = (): void => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    const listener = (): void => reject(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
    remove = (): void => signal.removeEventListener("abort", listener);
    if (signal.aborted) {
      listener();
    }
  });
  try {
    return await Promise.race([Promise.resolve(iterator.next()), aborted]);
  } finally {
    remove();
  }
}

export function unsupportedClassicAdapter(name: string): Error & { code: string } {
  const error = new Error(
    `${name} is not supported in a WebAssembly component until a faithful node:stream implementation is available`,
  ) as Error & { code: string };
  error.code = "ERR_JCO_UNSUPPORTED_NODE_API";
  return error;
}
