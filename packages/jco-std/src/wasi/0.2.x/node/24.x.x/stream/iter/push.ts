/**
 * Push iterable streams and their Writer implementation.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/push.js (MIT license). Local changes replace the
 * internal ring buffer and promise hooks with portable queues while preserving
 * writer lifecycle, byte budgets, and the four backpressure policies.
 */

import { codedError, invalidArgType, invalidArgValue, outOfRange } from "../../errors/core.js";

import { isObject, toUint8Array, validateAbortSignal } from "../shared.js";
import { pull } from "./pull.js";
import {
  drainableProtocol,
  type BackpressurePolicy,
  type ByteBatch,
  type ByteReadableStream,
  type PushOptions,
  type PushResult,
  type PushWriter,
  type Transform,
  type WriteOptions,
} from "./types.js";

const DEFAULT_BUDGET = 16_384;
const BACKPRESSURE_POLICIES: readonly BackpressurePolicy[] = [
  "strict",
  "unbounded",
  "drop-oldest",
  "drop-newest",
];

interface QueueEntry {
  batch: ByteBatch;
  bytes: number;
}

function byteLength(batch: ByteBatch): number {
  return batch.reduce((total, chunk) => total + chunk.byteLength, 0);
}

function asError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return codedError(
    new Error(reason === undefined ? "The operation failed" : String(reason)),
    "ERR_OPERATION_FAILED",
  );
}

function validateOptions(
  options: PushOptions,
): Required<Pick<PushOptions, "budget" | "backpressure">> & PushOptions {
  if (options === null || typeof options !== "object") {
    throw invalidArgType("options", "Object", options);
  }
  const budget = options.budget ?? DEFAULT_BUDGET;
  if (!Number.isInteger(budget) || budget < DEFAULT_BUDGET) {
    throw outOfRange("options.budget", `>= ${DEFAULT_BUDGET} and an integer`, budget);
  }
  const backpressure = options.backpressure ?? "strict";
  if (!BACKPRESSURE_POLICIES.includes(backpressure)) {
    throw invalidArgValue(
      "options.backpressure",
      backpressure,
      `must be one of: ${BACKPRESSURE_POLICIES.join(", ")}`,
    );
  }
  validateAbortSignal(options.signal);
  return { ...options, budget, backpressure };
}

class PushState {
  readonly budget: number;
  readonly backpressure: BackpressurePolicy;
  readonly signal?: AbortSignal;

  queue: QueueEntry[] = [];
  bufferedBytes = 0;
  bytesWritten = 0;
  ended = false;
  failure?: Error;
  pendingStrictWrites = 0;

  private readonly readers = new Set<() => void>();
  private readonly drains = new Set<(value: boolean) => void>();

  constructor(options: PushOptions) {
    const validated = validateOptions(options);
    this.budget = validated.budget;
    this.backpressure = validated.backpressure;
    this.signal = validated.signal;
    if (this.signal) {
      const onAbort = (): void => this.fail(this.signal!.reason);
      if (this.signal.aborted) {
        onAbort();
      } else {
        this.signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  }

  get desiredSize(): number | null {
    return this.ended || this.failure ? null : Math.max(0, this.budget - this.bufferedBytes);
  }

  private wakeReaders(): void {
    for (const wake of this.readers) {
      wake();
    }
    this.readers.clear();
  }

  private wakeDrains(): void {
    if (this.bufferedBytes >= this.budget && !this.ended && !this.failure) {
      return;
    }
    const value = !this.ended && !this.failure;
    for (const resolve of this.drains) {
      resolve(value);
    }
    this.drains.clear();
  }

  private canFit(bytes: number): boolean {
    return this.bufferedBytes === 0 || this.bufferedBytes + bytes <= this.budget;
  }

  private enqueue(batch: ByteBatch): void {
    const bytes = byteLength(batch);
    this.queue.push({ batch, bytes });
    this.bufferedBytes += bytes;
    this.bytesWritten += bytes;
    this.wakeReaders();
  }

  writeSync(batch: ByteBatch): boolean {
    this.assertWritable();
    const bytes = byteLength(batch);
    if (this.backpressure === "drop-newest" && !this.canFit(bytes)) {
      return true;
    }
    if (this.backpressure === "drop-oldest") {
      while (!this.canFit(bytes) && this.queue.length > 0) {
        const dropped = this.queue.shift()!;
        this.bufferedBytes -= dropped.bytes;
      }
      this.enqueue(batch);
      return true;
    }
    if (!this.canFit(bytes)) {
      return false;
    }
    this.enqueue(batch);
    return true;
  }

  async write(batch: ByteBatch, options?: WriteOptions): Promise<void> {
    validateAbortSignal(options?.signal);
    options?.signal?.throwIfAborted();
    if (this.writeSync(batch)) {
      return;
    }
    if (this.backpressure === "strict") {
      this.pendingStrictWrites += 1;
      if (this.pendingStrictWrites > 1) {
        this.pendingStrictWrites -= 1;
        throw codedError(
          new Error("Backpressure violation: too many pending writes"),
          "ERR_STREAM_BACKPRESSURE",
        );
      }
    }
    try {
      while (true) {
        const writable = await this.waitForDrain(options?.signal);
        if (!writable) {
          this.assertWritable();
        }
        if (this.writeSync(batch)) {
          return;
        }
      }
    } finally {
      if (this.backpressure === "strict") {
        this.pendingStrictWrites -= 1;
      }
    }
  }

  endSync(): number {
    this.assertWritable();
    this.ended = true;
    this.wakeReaders();
    this.wakeDrains();
    return this.bytesWritten;
  }

  fail(reason?: unknown): void {
    if (this.ended || this.failure) {
      return;
    }
    this.failure = asError(reason);
    this.wakeReaders();
    this.wakeDrains();
  }

  async next(): Promise<IteratorResult<ByteBatch>> {
    while (true) {
      if (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        this.bufferedBytes -= entry.bytes;
        this.wakeDrains();
        return { done: false, value: entry.batch };
      }
      if (this.failure) {
        throw this.failure;
      }
      if (this.ended) {
        return { done: true, value: undefined };
      }
      await new Promise<void>((resolve) => this.readers.add(resolve));
    }
  }

  async waitForDrain(signal?: AbortSignal): Promise<boolean> {
    validateAbortSignal(signal);
    signal?.throwIfAborted();
    if (this.desiredSize === null) {
      return false;
    }
    if (this.desiredSize > 0) {
      return true;
    }
    return new Promise<boolean>((resolve, reject) => {
      const settle = (value: boolean): void => {
        signal?.removeEventListener("abort", abort);
        resolve(value);
      };
      const abort = (): void => {
        this.drains.delete(settle);
        reject(signal?.reason);
      };
      this.drains.add(settle);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  private assertWritable(): void {
    if (this.failure) {
      throw this.failure;
    }
    if (this.ended) {
      throw codedError(
        new Error("Cannot call write after a stream was ended"),
        "ERR_STREAM_WRITE_AFTER_END",
      );
    }
  }
}

class PortablePushWriter implements PushWriter {
  constructor(private readonly state: PushState) {}

  get desiredSize(): number | null {
    return this.state.desiredSize;
  }

  async write(chunk: Uint8Array | string, options?: WriteOptions): Promise<void> {
    await this.state.write([toUint8Array(chunk)], options);
  }

  async writev(chunks: Array<Uint8Array | string>, options?: WriteOptions): Promise<void> {
    if (!Array.isArray(chunks)) {
      throw invalidArgType("chunks", "Array", chunks);
    }
    await this.state.write(
      chunks.map((chunk, index) => toUint8Array(chunk, `chunks[${index}]`)),
      options,
    );
  }

  writeSync(chunk: Uint8Array | string): boolean {
    return this.state.writeSync([toUint8Array(chunk)]);
  }

  writevSync(chunks: Array<Uint8Array | string>): boolean {
    if (!Array.isArray(chunks)) {
      throw invalidArgType("chunks", "Array", chunks);
    }
    return this.state.writeSync(
      chunks.map((chunk, index) => toUint8Array(chunk, `chunks[${index}]`)),
    );
  }

  async end(options?: WriteOptions): Promise<number> {
    validateAbortSignal(options?.signal);
    options?.signal?.throwIfAborted();
    return this.state.endSync();
  }

  endSync(): number {
    return this.state.endSync();
  }

  fail(reason?: unknown): void {
    this.state.fail(reason);
  }

  [drainableProtocol](): Promise<boolean> | null {
    return this.state.desiredSize === null ? null : this.state.waitForDrain();
  }

  [Symbol.dispose](): void {
    this.state.fail(new DOMException("The writer was disposed", "AbortError"));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

export interface PushParts extends PushResult {
  readonly state: PushState;
}

export function createPush(options: PushOptions = {}): PushParts {
  const state = new PushState(options);
  const writer = new PortablePushWriter(state);
  const readable: ByteReadableStream = {
    [Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
      return {
        next: () => state.next(),
        async return(): Promise<IteratorResult<ByteBatch>> {
          state.fail(new DOMException("The reader was cancelled", "AbortError"));
          return { done: true, value: undefined };
        },
      };
    },
  };
  return { writer, readable, state };
}

function isPushOptions(value: unknown): value is PushOptions {
  return isObject(value) && !("transform" in value) && typeof value !== "function";
}

export function push(...args: Array<Transform | PushOptions>): PushResult {
  const values = [...args];
  const last = values.at(-1);
  const options = last !== undefined && isPushOptions(last) ? (values.pop() as PushOptions) : {};
  const transforms = values as Transform[];
  transforms.forEach((transform, index) => {
    if (
      typeof transform !== "function" &&
      (!isObject(transform) || typeof transform.transform !== "function")
    ) {
      throw invalidArgType(
        `transforms[${index}]`,
        ["Function", "Object with transform()"],
        transform,
      );
    }
  });
  const parts = createPush(options);
  return {
    writer: parts.writer,
    readable: transforms.length === 0 ? parts.readable : pull(parts.readable, ...transforms),
  };
}
