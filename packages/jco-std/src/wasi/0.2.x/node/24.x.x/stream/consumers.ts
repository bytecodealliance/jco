/**
 * Portable `node:stream/consumers` implementation.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/stream/consumers.js (MIT license). Local changes use engine-provided
 * Blob/TextDecoder and the demand-driven Jco Buffer global.
 */

import { invalidArgType } from "../errors/core.js";

import {
  isArrayBufferLike,
  isAsyncIterable,
  isSyncIterable,
  primitiveToUint8Array,
  toArrayBuffer,
} from "./shared.js";

export type ConsumerStream = AsyncIterable<unknown> | Iterable<unknown>;

function assertStream(stream: unknown): asserts stream is ConsumerStream {
  if (!isAsyncIterable(stream) && !isSyncIterable(stream)) {
    throw invalidArgType("stream", ["ReadableStream", "Readable", "AsyncIterator"], stream);
  }
}

async function collectParts(stream: ConsumerStream): Promise<BlobPart[]> {
  const parts: BlobPart[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === "string" || chunk instanceof Blob) {
      parts.push(chunk);
    } else if (isArrayBufferLike(chunk) || ArrayBuffer.isView(chunk)) {
      parts.push(toArrayBuffer(primitiveToUint8Array(chunk)));
    } else {
      parts.push(String(chunk));
    }
  }
  return parts;
}

export async function blob(stream: ConsumerStream): Promise<Blob> {
  assertStream(stream);
  return new Blob(await collectParts(stream));
}

export async function arrayBuffer(stream: ConsumerStream): Promise<ArrayBuffer> {
  return (await blob(stream)).arrayBuffer();
}

export async function buffer(stream: ConsumerStream): Promise<Buffer> {
  return Buffer.from(await arrayBuffer(stream));
}

export async function bytes(stream: ConsumerStream): Promise<Uint8Array> {
  return new Uint8Array(await arrayBuffer(stream));
}

export async function text(stream: ConsumerStream): Promise<string> {
  assertStream(stream);
  const decoder = new TextDecoder();
  let result = "";
  for await (const chunk of stream) {
    if (typeof chunk === "string") {
      result += chunk;
    } else if (isArrayBufferLike(chunk) || ArrayBuffer.isView(chunk)) {
      result += decoder.decode(primitiveToUint8Array(chunk), { stream: true });
    } else {
      throw invalidArgType("chunk", ["string", "Buffer", "TypedArray", "DataView"], chunk);
    }
  }
  return result + decoder.decode();
}

export async function json(stream: ConsumerStream): Promise<unknown> {
  return JSON.parse(await text(stream)) as unknown;
}

const streamConsumers = {
  arrayBuffer,
  blob,
  buffer,
  bytes,
  text,
  json,
};

export default streamConsumers;
