/**
 * Iterable-stream consumers and utilities.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/consumers.js (MIT license). Local changes use
 * portable iteration, promises, TextDecoder, and jco-std validation helpers.
 */

import { invalidArgType } from "../../errors/core.js";

import {
  abortableNext,
  addByteLength,
  concatBytes,
  isArrayBufferLike,
  isAsyncIterable,
  isObject,
  isSyncIterable,
  toArrayBuffer,
  validateAbortSignal,
  validateConsumeOptions,
  validateSyncConsumeOptions,
} from "../shared.js";
import { from, fromSync } from "./from.js";
import {
  drainableProtocol,
  toAsyncStreamable,
  toStreamable,
  type ByteBatch,
  type ByteReadableStream,
  type ConsumeOptions,
  type ConsumeSyncOptions,
  type MergeOptions,
  type Source,
  type StatelessTransform,
  type SyncSource,
  type SyncStatelessTransform,
  type TextConsumeOptions,
  type TextConsumeSyncOptions,
} from "./types.js";

const EMPTY_OPTIONS = Object.freeze({});

function collectSync(source: SyncSource, limit?: number): ByteBatch {
  const chunks: ByteBatch = [];
  let total = 0;
  for (const batch of fromSync(source)) {
    for (const chunk of batch) {
      total = addByteLength(total, chunk, limit);
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function collectAsync(
  source: Source,
  signal?: AbortSignal,
  limit?: number,
): Promise<ByteBatch> {
  signal?.throwIfAborted();
  const chunks: ByteBatch = [];
  let total = 0;
  const iterator = from(source)[Symbol.asyncIterator]();
  let completed = false;
  try {
    while (true) {
      const result = await abortableNext(iterator, signal);
      if (result.done) {
        completed = true;
        return chunks;
      }
      signal?.throwIfAborted();
      for (const chunk of result.value) {
        total = addByteLength(total, chunk, limit);
        chunks.push(chunk);
      }
    }
  } finally {
    if (!completed && typeof iterator.return === "function") {
      const cleanup = iterator.return();
      if (signal?.aborted) {
        void Promise.resolve(cleanup).catch(() => {});
      } else {
        await cleanup;
      }
    }
  }
}

export function bytesSync(
  source: SyncSource,
  options: ConsumeSyncOptions = EMPTY_OPTIONS,
): Uint8Array {
  validateSyncConsumeOptions(options);
  return concatBytes(collectSync(source, options.limit));
}

export function textSync(
  source: SyncSource,
  options: TextConsumeSyncOptions = EMPTY_OPTIONS,
): string {
  validateSyncConsumeOptions(options);
  return new TextDecoder(options.encoding ?? "utf-8", { fatal: true }).decode(
    concatBytes(collectSync(source, options.limit)),
  );
}

export function arrayBufferSync(
  source: SyncSource,
  options: ConsumeSyncOptions = EMPTY_OPTIONS,
): ArrayBuffer {
  validateSyncConsumeOptions(options);
  return toArrayBuffer(concatBytes(collectSync(source, options.limit)));
}

export function arraySync(
  source: SyncSource,
  options: ConsumeSyncOptions = EMPTY_OPTIONS,
): ByteBatch {
  validateSyncConsumeOptions(options);
  return collectSync(source, options.limit);
}

export async function bytes(
  source: Source,
  options: ConsumeOptions = EMPTY_OPTIONS,
): Promise<Uint8Array> {
  validateConsumeOptions(options);
  return concatBytes(await collectAsync(source, options.signal, options.limit));
}

export async function text(
  source: Source,
  options: TextConsumeOptions = EMPTY_OPTIONS,
): Promise<string> {
  validateConsumeOptions(options);
  return new TextDecoder(options.encoding ?? "utf-8", { fatal: true }).decode(
    concatBytes(await collectAsync(source, options.signal, options.limit)),
  );
}

export async function arrayBuffer(
  source: Source,
  options: ConsumeOptions = EMPTY_OPTIONS,
): Promise<ArrayBuffer> {
  validateConsumeOptions(options);
  return toArrayBuffer(concatBytes(await collectAsync(source, options.signal, options.limit)));
}

export async function array(
  source: Source,
  options: ConsumeOptions = EMPTY_OPTIONS,
): Promise<ByteBatch> {
  validateConsumeOptions(options);
  return collectAsync(source, options.signal, options.limit);
}

export function tap(callback: StatelessTransform): StatelessTransform {
  if (typeof callback !== "function") {
    throw invalidArgType("callback", "Function", callback);
  }
  return async (chunks, options) => {
    await callback(chunks, options);
    return chunks;
  };
}

export function tapSync(callback: SyncStatelessTransform): SyncStatelessTransform {
  if (typeof callback !== "function") {
    throw invalidArgType("callback", "Function", callback);
  }
  return (chunks) => {
    callback(chunks);
    return chunks;
  };
}

export function ondrain(drainable: unknown): Promise<boolean> | null {
  if (!isObject(drainable) || typeof drainable[drainableProtocol] !== "function") {
    return null;
  }
  const result = Reflect.apply(drainable[drainableProtocol], drainable, []);
  if (result === null || result instanceof Promise) {
    return result;
  }
  return Promise.resolve(result as boolean);
}

function isMergeOptions(value: unknown): value is MergeOptions {
  return (
    isObject(value) &&
    !ArrayBuffer.isView(value) &&
    !isArrayBufferLike(value) &&
    !isSyncIterable(value) &&
    !isAsyncIterable(value) &&
    typeof value[toStreamable] !== "function" &&
    typeof value[toAsyncStreamable] !== "function"
  );
}

interface PendingBatch {
  index: number;
  result?: IteratorResult<ByteBatch>;
  error?: unknown;
}

export function merge(...args: Array<Source | MergeOptions>): ByteReadableStream {
  let options: MergeOptions | undefined;
  let sources: Source[];
  const last = args.at(-1);
  if (last !== undefined && isMergeOptions(last)) {
    options = last;
    sources = args.slice(0, -1) as Source[];
  } else {
    sources = args as Source[];
  }
  validateAbortSignal(options?.signal);
  const normalized = sources.map((source) => from(source));

  return {
    async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
      const signal = options?.signal;
      signal?.throwIfAborted();
      const iterators = normalized.map((source) => source[Symbol.asyncIterator]());
      const pending = new Map<number, Promise<PendingBatch>>();
      const schedule = (index: number): void => {
        const iterator = iterators[index];
        pending.set(
          index,
          abortableNext(iterator, signal).then(
            (result) => ({ index, result }),
            (error: unknown) => ({ index, error }),
          ),
        );
      };
      iterators.forEach((_iterator, index) => schedule(index));
      try {
        while (pending.size > 0) {
          signal?.throwIfAborted();
          const settled = await Promise.race(pending.values());
          pending.delete(settled.index);
          if ("error" in settled) {
            throw settled.error;
          }
          if (!settled.result?.done) {
            yield settled.result!.value;
            schedule(settled.index);
          }
        }
      } finally {
        await Promise.all(
          iterators.map(async (iterator) => {
            if (typeof iterator.return === "function") {
              await iterator.return();
            }
          }),
        );
      }
    },
  };
}
