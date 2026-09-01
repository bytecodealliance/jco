/**
 * Classic Node stream interop for iterable streams.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/classic.js (MIT license). Local changes duck-type
 * readable/writable inputs so they do not require a Node host. The three output
 * adapters fail explicitly because neither the engine nor audited unenv code
 * provides faithful classic Readable/Writable constructors yet.
 */

import { invalidArgType, invalidArgValue } from "../../errors/core.js";

import { isObject, toUint8Array, unsupportedClassicAdapter } from "../shared.js";
import { from } from "./from.js";
import {
  drainableProtocol,
  toAsyncStreamable,
  type BackpressurePolicy,
  type ByteBatch,
  type ByteReadableStream,
  type ClassicReadable,
  type ClassicWritable,
  type FromWritableOptions,
  type Source,
  type WriteOptions,
  type Writer,
} from "./types.js";

const readableCache = new WeakMap<object, ByteReadableStream>();
const writableCache = new WeakMap<object, Map<BackpressurePolicy, Writer>>();

function isClassicReadable(value: unknown): value is ClassicReadable {
  return (
    isObject(value) &&
    typeof value.read === "function" &&
    typeof value.on === "function" &&
    typeof value.off === "function"
  );
}

function isClassicWritable(value: unknown): value is ClassicWritable {
  return isObject(value) && typeof value.write === "function" && typeof value.on === "function";
}

type ReadableWake = { type: "readable" | "end" } | { type: "error"; error: unknown };

function waitReadable(readable: ClassicReadable): Promise<ReadableWake> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = (): void => {
      readable.off("readable", onReadable);
      readable.off("end", onEnd);
      readable.off("close", onEnd);
      readable.off("error", onError);
    };
    const settle = (value: ReadableWake): void => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(value);
      }
    };
    const onReadable = (..._args: unknown[]): void => settle({ type: "readable" });
    const onEnd = (..._args: unknown[]): void => settle({ type: "end" });
    const onError = (error: unknown): void => settle({ type: "error", error });
    readable.on("readable", onReadable);
    readable.on("end", onEnd);
    readable.on("close", onEnd);
    readable.on("error", onError);
    readable.resume?.();
  });
}

export function fromReadable(readable: ClassicReadable): ByteReadableStream {
  if (!isClassicReadable(readable)) {
    throw invalidArgType("readable", "stream.Readable", readable);
  }
  const cached = readableCache.get(readable);
  if (cached) {
    return cached;
  }
  if (typeof readable[toAsyncStreamable] === "function") {
    const streamable = from(readable as Source);
    readableCache.set(readable, streamable);
    return streamable;
  }
  const source: ByteReadableStream = {
    async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
      while (true) {
        const batch: ByteBatch = [];
        while (true) {
          const chunk = readable.read();
          if (chunk === null || chunk === undefined) {
            break;
          }
          for await (const normalized of from(chunk as Source)) {
            batch.push(...normalized);
          }
        }
        if (batch.length > 0) {
          yield batch;
          continue;
        }
        if (readable.readableEnded) {
          return;
        }
        const wake = await waitReadable(readable);
        if (wake.type === "error") {
          throw wake.error;
        }
        if (wake.type === "end") {
          return;
        }
      }
    },
  };
  readableCache.set(readable, source);
  return source;
}

const WRITABLE_POLICIES: readonly BackpressurePolicy[] = ["strict", "unbounded", "drop-newest"];

class ClassicWriterAdapter implements Writer {
  private bytesWritten = 0;
  private ended = false;

  constructor(
    private readonly writable: ClassicWritable,
    private readonly policy: BackpressurePolicy,
  ) {}

  get desiredSize(): number | null {
    if (this.ended || this.writable.writableEnded) {
      return null;
    }
    const highWaterMark = this.writable.writableHighWaterMark ?? 16_384;
    const length = this.writable.writableLength ?? 0;
    return Math.max(0, highWaterMark - length);
  }

  async write(chunk: Uint8Array | string, _options?: WriteOptions): Promise<void> {
    const data = toUint8Array(chunk);
    if (this.policy === "drop-newest" && this.desiredSize === 0) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (error?: Error | null): void => {
        if (!settled) {
          settled = true;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      };
      try {
        this.writable.write(data, done);
      } catch (error) {
        reject(error);
      }
    });
    this.bytesWritten += data.byteLength;
  }

  async writev(chunks: Array<Uint8Array | string>, options?: WriteOptions): Promise<void> {
    this.writable.cork?.();
    try {
      for (const chunk of chunks) {
        await this.write(chunk, options);
      }
    } finally {
      this.writable.uncork?.();
    }
  }

  writeSync(_chunk: Uint8Array | string): boolean {
    return false;
  }

  writevSync(_chunks: Array<Uint8Array | string>): boolean {
    return false;
  }

  async end(_options?: WriteOptions): Promise<number> {
    if (!this.ended) {
      await new Promise<void>((resolve, reject) => {
        try {
          this.writable.end((error?: Error | null) => (error ? reject(error) : resolve()));
        } catch (error) {
          reject(error);
        }
      });
      this.ended = true;
    }
    return this.bytesWritten;
  }

  endSync(): number {
    return -1;
  }

  fail(reason?: unknown): void {
    this.ended = true;
    const error =
      reason instanceof Error ? reason : new Error(String(reason ?? "The operation failed"));
    this.writable.destroy?.(error);
  }

  [drainableProtocol](): Promise<boolean> | null {
    if (this.desiredSize === null) {
      return null;
    }
    if (this.desiredSize > 0) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const onDrain = (..._args: unknown[]): void => {
        this.writable.off?.("drain", onDrain);
        resolve(true);
      };
      if (typeof this.writable.once === "function") {
        this.writable.once("drain", onDrain);
      } else {
        this.writable.on("drain", onDrain);
      }
    });
  }

  [Symbol.dispose](): void {
    this.fail(new DOMException("The writer was disposed", "AbortError"));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

export function fromWritable(writable: ClassicWritable, options: FromWritableOptions = {}): Writer {
  if (!isClassicWritable(writable)) {
    throw invalidArgType("writable", "stream.Writable", writable);
  }
  if (options === null || typeof options !== "object") {
    throw invalidArgType("options", "Object", options);
  }
  if (writable.writableObjectMode) {
    throw invalidArgValue("writable", writable, "must not be in object mode");
  }
  const policy = options.backpressure ?? "strict";
  if (!WRITABLE_POLICIES.includes(policy)) {
    throw invalidArgValue(
      "options.backpressure",
      policy,
      `must be one of: ${WRITABLE_POLICIES.join(", ")}`,
    );
  }
  let policies = writableCache.get(writable);
  if (!policies) {
    policies = new Map();
    writableCache.set(writable, policies);
  }
  let adapter = policies.get(policy);
  if (!adapter) {
    adapter = new ClassicWriterAdapter(writable, policy);
    policies.set(policy, adapter);
  }
  return adapter;
}

/** Requires a faithful `node:stream.Readable` constructor, which is not yet available. */
export function toReadable(_source: unknown, _options?: unknown): never {
  throw unsupportedClassicAdapter("stream/iter.toReadable");
}

/** Requires a faithful `node:stream.Readable` constructor, which is not yet available. */
export function toReadableSync(_source: unknown, _options?: unknown): never {
  throw unsupportedClassicAdapter("stream/iter.toReadableSync");
}

/** Requires a faithful `node:stream.Writable` constructor, which is not yet available. */
export function toWritable(_writer: unknown): never {
  throw unsupportedClassicAdapter("stream/iter.toWritable");
}
