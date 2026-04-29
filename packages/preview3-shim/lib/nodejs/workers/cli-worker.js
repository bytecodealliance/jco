import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "stream/promises";

import { Router } from "../workers/resource-worker.js";

Router().op("stdout", handleOp).op("stderr", handleOp);

async function handleOp(msg) {
  const { op, stream } = msg;

  const readable = Readable.from(byteChunks(stream), { objectMode: false });
  const writable = op === "stdout" ? process.stdout : process.stderr;

  await pipeline(readable, writable, { end: false });
  return { ok: true };
}

async function* byteChunks(stream) {
  for await (const value of stream) {
    yield nodeByteChunk(value);
  }
}

function assertByte(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Invalid byte stream value: ${value}`);
  }
  return value;
}

function nodeByteChunk(value) {
  if (value instanceof Uint8Array) {
    return value; // also matches Buffer
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    for (const byte of value) {
      assertByte(byte);
    }
    return Uint8Array.from(value);
  }
  if (typeof value === "number") {
    return Uint8Array.of(assertByte(value));
  }
  return value;
}
