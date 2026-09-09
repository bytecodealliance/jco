/**
 * Classic Node streams over readable-stream 4.7.0's MIT-licensed Node 18.19 core.
 * Node 24 additions below are adapted from nodejs/node v24.20.0,
 * 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/stream.js and
 * lib/internal/streams/{readable,writable,state}.js (MIT).
 * Local changes use public Web APIs and a portable scheduling queue.
 */
import { core } from "./core.js";
import { duplexPair } from "./duplex-pair.js";
import { installLifecycle } from "./lifecycle.js";
import {
  fromReadableWeb,
  toReadableWeb,
  fromWritableWeb,
  toWritableWeb,
  fromDuplexWeb,
  toDuplexWeb,
  abortError,
} from "./web.js";
import { toAsyncStreamable, type ByteBatch } from "./iter/types.js";
import { toUint8Array } from "./shared.js";
import type {
  Readable as ReadableInstance,
  Writable as WritableInstance,
  StreamModule,
} from "./types.js";

// The byte-mode default increased in Node 22. Object-mode remains 16.
core.setDefaultHighWaterMark(false, 64 * 1024);
core.Readable.fromWeb = fromReadableWeb;
core.Readable.toWeb = toReadableWeb;
core.Readable.isDisturbed = core.isDisturbed;
core.Writable.fromWeb = fromWritableWeb;
core.Writable.toWeb = toWritableWeb;
core.Duplex.fromWeb = fromDuplexWeb;
core.Duplex.toWeb = toDuplexWeb;
core.duplexPair = duplexPair;
core._isArrayBufferView = ArrayBuffer.isView;
installLifecycle();

// Node 22 accepts all ArrayBuffer views, preserving their byte offset and length.
function byteChunk(chunk: unknown, objectMode: boolean): unknown {
  return !objectMode && ArrayBuffer.isView(chunk) && !(chunk instanceof Uint8Array)
    ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    : chunk;
}
const push = core.Readable.prototype.push;
core.Readable.prototype.push = function (chunk: unknown, encoding?: string): boolean {
  return push.call(this, byteChunk(chunk, this.readableObjectMode), encoding);
};
const unshift = core.Readable.prototype.unshift;
core.Readable.prototype.unshift = function (chunk: unknown, encoding?: string): void {
  unshift.call(this, byteChunk(chunk, this.readableObjectMode), encoding);
};
const write = core.Writable.prototype.write;
const end = core.Writable.prototype.end;
for (const prototype of [core.Writable.prototype, core.Duplex.prototype]) {
  prototype.write = function (chunk: unknown, ...args: unknown[]): boolean {
    return Reflect.apply(write, this, [byteChunk(chunk, this.writableObjectMode), ...args]);
  };
  prototype.end = function (chunk?: unknown, ...args: unknown[]): typeof this {
    return Reflect.apply(end, this, [byteChunk(chunk, this.writableObjectMode), ...args]);
  };
}

// Adapted from the pinned Node readable/writable async-disposal methods.
core.Readable.prototype[Symbol.asyncDispose] = async function (
  this: ReadableInstance,
): Promise<void> {
  let expected: Error | undefined;
  if (!this.destroyed) {
    expected = this.readableEnded ? undefined : abortError();
    this.destroy(expected);
  }
  await new Promise<void>((resolve, reject): void => {
    core.finished(this, (error): void => {
      if (error && error !== expected) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};
core.Writable.prototype[Symbol.asyncDispose] = async function (
  this: WritableInstance,
): Promise<void> {
  if (!this.destroyed) {
    this.destroy(this.writableFinished ? undefined : abortError());
  }
  await new Promise<void>((resolve, reject): void => {
    core.finished(this, (error): void => {
      if (error && error.name !== "AbortError") {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

Object.defineProperty(core.Readable.prototype, toAsyncStreamable, {
  configurable: true,
  writable: true,
  value: async function* (this: ReadableInstance): AsyncGenerator<ByteBatch> {
    for await (const chunk of this) {
      yield [toUint8Array(chunk)];
    }
  },
});

export type {
  ReadableOptions,
  WritableOptions,
  DuplexOptions,
  TransformOptions,
  StreamOptions,
  Callback,
  TransformCallback,
  FinishedOptions,
  PipelineOptions,
  IteratorOptions,
  OperatorOptions,
} from "./types.js";
export type Stream = import("./types.js").Stream;
export type Readable<T = unknown> = import("./types.js").Readable<T>;
export type Writable = import("./types.js").Writable;
export type Duplex<T = unknown> = import("./types.js").Duplex<T>;
export type Transform<T = unknown> = import("./types.js").Transform<T>;
export type PassThrough<T = unknown> = Transform<T>;
export const Stream: StreamModule = core;
export const Readable: StreamModule["Readable"] = core.Readable;
export const Writable: StreamModule["Writable"] = core.Writable;
export const Duplex: StreamModule["Duplex"] = core.Duplex;
export const Transform: StreamModule["Transform"] = core.Transform;
export const PassThrough: StreamModule["PassThrough"] = core.PassThrough;
export const pipeline: StreamModule["pipeline"] = core.pipeline;
export const finished: StreamModule["finished"] = core.finished;
export const promises: StreamModule["promises"] = core.promises;
export const compose: StreamModule["compose"] = core.compose;
export const addAbortSignal: StreamModule["addAbortSignal"] = core.addAbortSignal;
export const destroy: StreamModule["destroy"] = core.destroy;
export const isDestroyed: StreamModule["isDestroyed"] = core.isDestroyed;
export const isDisturbed: StreamModule["isDisturbed"] = core.isDisturbed;
export const isErrored: StreamModule["isErrored"] = core.isErrored;
export const isReadable: StreamModule["isReadable"] = core.isReadable;
export const isWritable: StreamModule["isWritable"] = core.isWritable;
export const getDefaultHighWaterMark: StreamModule["getDefaultHighWaterMark"] =
  core.getDefaultHighWaterMark;
export const setDefaultHighWaterMark: StreamModule["setDefaultHighWaterMark"] =
  core.setDefaultHighWaterMark;
export const _isUint8Array: StreamModule["_isUint8Array"] = core._isUint8Array;
export const _isArrayBufferView: StreamModule["_isArrayBufferView"] = core._isArrayBufferView;
export const _uint8ArrayToBuffer: StreamModule["_uint8ArrayToBuffer"] = core._uint8ArrayToBuffer;
export { duplexPair };
export default Stream;
