/**
 * Iterable-stream broadcast and share implementations.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/{broadcast,share}.js (MIT license). Local changes
 * replace Node's ring buffers and promise hooks with typed portable queues.
 */

import { invalidArgType } from "../../errors/core.js";

import { isObject, toUint8Array, validateAbortSignal } from "../shared.js";
import { from, fromSync } from "./from.js";
import { pull, pullSync } from "./pull.js";
import { createPush } from "./push.js";
import {
  broadcastProtocol,
  drainableProtocol,
  shareProtocol,
  shareSyncProtocol,
  type Broadcast as BroadcastContract,
  type BroadcastResult,
  type BroadcastWriter,
  type ByteBatch,
  type ByteReadableStream,
  type MulticastOptions,
  type PushWriter,
  type Share as ShareContract,
  type Source,
  type SyncByteReadableStream,
  type SyncShare as SyncShareContract,
  type SyncSource,
  type SyncTransform,
  type Transform,
  type WriteOptions,
} from "./types.js";

function batchLength(batch: ByteBatch): number {
  return batch.reduce((total, chunk) => total + chunk.byteLength, 0);
}

function isOptions(value: unknown): value is MulticastOptions {
  return isObject(value) && !("transform" in value) && typeof value !== "function";
}

interface BroadcastSubscriber {
  writer: PushWriter;
  remove(): void;
}

class BroadcastWriterImpl implements BroadcastWriter {
  bytesWritten = 0;
  ended = false;

  constructor(private readonly subscribers: Set<BroadcastSubscriber>) {}

  get desiredSize(): number | null {
    if (this.ended) {
      return null;
    }
    let result = Number.POSITIVE_INFINITY;
    for (const subscriber of this.subscribers) {
      const size = subscriber.writer.desiredSize;
      if (size === null) {
        return null;
      }
      result = Math.min(result, size);
    }
    return result;
  }

  async write(chunk: Uint8Array | string, options?: WriteOptions): Promise<void> {
    const byte = toUint8Array(chunk);
    await Promise.all(
      [...this.subscribers].map((subscriber) => subscriber.writer.write(byte, options)),
    );
    this.bytesWritten += byte.byteLength;
  }

  async writev(chunks: Array<Uint8Array | string>, options?: WriteOptions): Promise<void> {
    const batch = chunks.map((chunk, index) => toUint8Array(chunk, `chunks[${index}]`));
    await Promise.all(
      [...this.subscribers].map((subscriber) => subscriber.writer.writev(batch, options)),
    );
    this.bytesWritten += batchLength(batch);
  }

  writeSync(chunk: Uint8Array | string): boolean {
    return this.writevSync([chunk]);
  }

  writevSync(chunks: Array<Uint8Array | string>): boolean {
    const batch = chunks.map((chunk, index) => toUint8Array(chunk, `chunks[${index}]`));
    const bytes = batchLength(batch);
    for (const subscriber of this.subscribers) {
      const desired = subscriber.writer.desiredSize;
      if (desired !== null && desired !== 0 && desired < bytes) {
        return false;
      }
    }
    for (const subscriber of this.subscribers) {
      if (!subscriber.writer.writevSync(batch)) {
        return false;
      }
    }
    this.bytesWritten += bytes;
    return true;
  }

  async end(options?: WriteOptions): Promise<number> {
    if (!this.ended) {
      this.ended = true;
      await Promise.all([...this.subscribers].map((subscriber) => subscriber.writer.end(options)));
    }
    return this.bytesWritten;
  }

  endSync(): number {
    if (!this.ended) {
      for (const subscriber of this.subscribers) {
        subscriber.writer.endSync();
      }
      this.ended = true;
    }
    return this.bytesWritten;
  }

  fail(reason?: unknown): void {
    for (const subscriber of this.subscribers) {
      subscriber.writer.fail(reason);
    }
    this.ended = true;
  }

  [drainableProtocol](): Promise<boolean> | null {
    if (this.ended) {
      return null;
    }
    const drains = [...this.subscribers].map((subscriber) => {
      const result = subscriber.writer[drainableProtocol]();
      return result ?? Promise.resolve(false);
    });
    return Promise.all(drains).then((values) => values.every(Boolean));
  }

  [Symbol.dispose](): void {
    this.fail(new DOMException("The writer was disposed", "AbortError"));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

export class Broadcast implements BroadcastContract {
  private readonly subscribers = new Set<BroadcastSubscriber>();
  private readonly writer = new BroadcastWriterImpl(this.subscribers);
  private cancelled = false;
  private readonly options: MulticastOptions;

  constructor(options: MulticastOptions = {}) {
    if (options === null || typeof options !== "object") {
      throw invalidArgType("options", "Object", options);
    }
    validateAbortSignal(options.signal);
    this.options = options;
    options.signal?.addEventListener("abort", () => this.cancel(options.signal!.reason), {
      once: true,
    });
  }

  static from(input: Source, options: MulticastOptions = {}): BroadcastResult {
    if (isObject(input) && typeof input[broadcastProtocol] === "function") {
      return Reflect.apply(input[broadcastProtocol], input, [options]) as BroadcastResult;
    }
    const result = broadcast(options);
    void (async () => {
      try {
        for await (const batch of from(input)) {
          await result.writer.writev(batch);
        }
        await result.writer.end();
      } catch (error) {
        result.writer.fail(error);
      }
    })();
    return result;
  }

  get consumerCount(): number {
    return this.subscribers.size;
  }

  get bufferSize(): number {
    let size = 0;
    for (const subscriber of this.subscribers) {
      const desired = subscriber.writer.desiredSize;
      if (desired !== null && this.options.budget !== undefined) {
        size += Math.max(0, this.options.budget - desired);
      }
    }
    return size;
  }

  push(...args: Array<Transform | MulticastOptions>): ByteReadableStream {
    if (this.cancelled) {
      throw new DOMException("The broadcast was cancelled", "AbortError");
    }
    const values = [...args];
    const last = values.at(-1);
    const localOptions =
      last !== undefined && isOptions(last) ? (values.pop() as MulticastOptions) : {};
    const transforms = values as Transform[];
    const parts = createPush({ ...this.options, ...localOptions });
    let removed = false;
    const subscriber: BroadcastSubscriber = {
      writer: parts.writer,
      remove: (): void => {
        if (!removed) {
          removed = true;
          this.subscribers.delete(subscriber);
        }
      },
    };
    this.subscribers.add(subscriber);
    const source = transforms.length > 0 ? pull(parts.readable, ...transforms) : parts.readable;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
        try {
          yield* source;
        } finally {
          subscriber.remove();
        }
      },
    };
  }

  cancel(reason?: unknown): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.writer.fail(reason ?? new DOMException("The broadcast was cancelled", "AbortError"));
  }

  getWriter(): BroadcastWriter {
    return this.writer;
  }

  [Symbol.dispose](): void {
    this.cancel();
  }
}

export function broadcast(options: MulticastOptions = {}): BroadcastResult {
  const instance = new Broadcast(options);
  return { writer: instance.getWriter(), broadcast: instance };
}

interface AsyncReaderState {
  cursor: number;
}

export class Share implements ShareContract {
  private readonly iterator: AsyncIterator<ByteBatch>;
  private readonly cache: ByteBatch[] = [];
  private readonly readers = new Set<AsyncReaderState>();
  private base = 0;
  private done = false;
  private failure?: unknown;
  private loading?: Promise<void>;
  private cancelled = false;

  constructor(
    source: Source,
    private readonly options: MulticastOptions = {},
  ) {
    if (options === null || typeof options !== "object") {
      throw invalidArgType("options", "Object", options);
    }
    validateAbortSignal(options.signal);
    this.iterator = from(source)[Symbol.asyncIterator]();
    options.signal?.addEventListener("abort", () => this.cancel(options.signal!.reason), {
      once: true,
    });
  }

  static from(input: Source, options: MulticastOptions = {}): Share {
    if (isObject(input) && typeof input[shareProtocol] === "function") {
      return Reflect.apply(input[shareProtocol], input, [options]) as Share;
    }
    return new Share(input, options);
  }

  get consumerCount(): number {
    return this.readers.size;
  }

  get bufferSize(): number {
    return this.cache.reduce((total, batch) => total + batchLength(batch), 0);
  }

  private async ensure(index: number): Promise<void> {
    while (!this.done && this.failure === undefined && index >= this.base + this.cache.length) {
      this.loading ??= (async () => {
        try {
          const result = await this.iterator.next();
          if (result.done) {
            this.done = true;
          } else {
            this.cache.push(result.value);
          }
        } catch (error) {
          this.failure = error;
        } finally {
          this.loading = undefined;
        }
      })();
      await this.loading;
    }
  }

  private prune(): void {
    if (this.readers.size === 0) {
      return;
    }
    const minimum = Math.min(...[...this.readers].map((reader) => reader.cursor));
    const count = minimum - this.base;
    if (count > 0) {
      this.cache.splice(0, count);
      this.base = minimum;
    }
  }

  private async *iterate(options: MulticastOptions): AsyncIterator<ByteBatch> {
    const reader: AsyncReaderState = { cursor: this.base };
    this.readers.add(reader);
    try {
      while (true) {
        options.signal?.throwIfAborted();
        await this.ensure(reader.cursor);
        if (this.failure !== undefined) {
          throw this.failure;
        }
        const batch = this.cache[reader.cursor - this.base];
        if (batch === undefined) {
          return;
        }
        reader.cursor += 1;
        yield batch;
        this.prune();
      }
    } finally {
      this.readers.delete(reader);
      this.prune();
    }
  }

  pull(...args: Array<Transform | MulticastOptions>): ByteReadableStream {
    const values = [...args];
    const last = values.at(-1);
    const localOptions =
      last !== undefined && isOptions(last) ? (values.pop() as MulticastOptions) : {};
    const transforms = values as Transform[];
    const raw: ByteReadableStream = {
      [Symbol.asyncIterator]: () => this.iterate(localOptions),
    };
    return transforms.length > 0 ? pull(raw, ...transforms, localOptions) : raw;
  }

  cancel(reason?: unknown): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.failure = reason ?? new DOMException("The shared stream was cancelled", "AbortError");
    if (typeof this.iterator.return === "function") {
      void Promise.resolve(this.iterator.return()).catch(() => {});
    }
  }

  [Symbol.dispose](): void {
    this.cancel();
  }
}

export function share(source: Source, options: MulticastOptions = {}): Share {
  return Share.from(source, options);
}

interface SyncReaderState {
  cursor: number;
}

export class SyncShare implements SyncShareContract {
  private readonly iterator: Iterator<ByteBatch>;
  private readonly cache: ByteBatch[] = [];
  private readonly readers = new Set<SyncReaderState>();
  private base = 0;
  private done = false;
  private failure?: unknown;

  constructor(source: SyncSource, options: MulticastOptions = {}) {
    if (options === null || typeof options !== "object") {
      throw invalidArgType("options", "Object", options);
    }
    this.iterator = fromSync(source)[Symbol.iterator]();
  }

  static fromSync(input: SyncSource, options: MulticastOptions = {}): SyncShare {
    if (isObject(input) && typeof input[shareSyncProtocol] === "function") {
      return Reflect.apply(input[shareSyncProtocol], input, [options]) as SyncShare;
    }
    return new SyncShare(input, options);
  }

  get consumerCount(): number {
    return this.readers.size;
  }

  get bufferSize(): number {
    return this.cache.reduce((total, batch) => total + batchLength(batch), 0);
  }

  private ensure(index: number): void {
    while (!this.done && this.failure === undefined && index >= this.base + this.cache.length) {
      try {
        const result = this.iterator.next();
        if (result.done) {
          this.done = true;
        } else {
          this.cache.push(result.value);
        }
      } catch (error) {
        this.failure = error;
      }
    }
  }

  private prune(): void {
    if (this.readers.size === 0) {
      return;
    }
    const minimum = Math.min(...[...this.readers].map((reader) => reader.cursor));
    const count = minimum - this.base;
    if (count > 0) {
      this.cache.splice(0, count);
      this.base = minimum;
    }
  }

  private *iterate(): Iterator<ByteBatch> {
    const reader: SyncReaderState = { cursor: this.base };
    this.readers.add(reader);
    try {
      while (true) {
        this.ensure(reader.cursor);
        if (this.failure !== undefined) {
          throw this.failure;
        }
        const batch = this.cache[reader.cursor - this.base];
        if (batch === undefined) {
          return;
        }
        reader.cursor += 1;
        yield batch;
        this.prune();
      }
    } finally {
      this.readers.delete(reader);
      this.prune();
    }
  }

  pull(...transforms: SyncTransform[]): SyncByteReadableStream {
    const raw: SyncByteReadableStream = {
      [Symbol.iterator]: () => this.iterate(),
    };
    return transforms.length > 0 ? pullSync(raw as SyncSource, ...transforms) : raw;
  }

  cancel(reason?: unknown): void {
    this.failure = reason ?? new DOMException("The shared stream was cancelled", "AbortError");
    if (typeof this.iterator.return === "function") {
      this.iterator.return();
    }
  }

  [Symbol.dispose](): void {
    this.cancel();
  }
}

export function shareSync(source: SyncSource, options: MulticastOptions = {}): SyncShare {
  return SyncShare.fromSync(source, options);
}
