/**
 * Iterable-stream transform pipelines and writer piping.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/{pull,transform}.js (MIT license). Local changes
 * use async/sync generators and public AbortSignal behavior instead of Node
 * primordials and internal promise hooks.
 */

import { invalidArgType } from "../../errors/core.js";

import { isObject, toUint8Array, validateAbortSignal } from "../shared.js";
import { from, fromSync } from "./from.js";
import {
  type ByteBatch,
  type ByteReadableStream,
  type PartialSyncWriter,
  type PartialWriter,
  type PipeToOptions,
  type PipeToSyncOptions,
  type PullOptions,
  type Source,
  type StatefulTransform,
  type StatelessTransform,
  type SyncByteReadableStream,
  type SyncSource,
  type SyncStatefulTransform,
  type SyncStatelessTransform,
  type SyncTransform,
  type Transform,
} from "./types.js";

function isTransformObject(value: unknown): value is StatefulTransform | SyncStatefulTransform {
  return isObject(value) && typeof value.transform === "function";
}

function isTransform(value: unknown): value is Transform | SyncTransform {
  return typeof value === "function" || isTransformObject(value);
}

function isPullOptions(value: unknown): value is PullOptions {
  return (
    typeof value === "object" && value !== null && !("transform" in value) && !("write" in value)
  );
}

function parsePullArgs(args: Array<Transform | PullOptions>): {
  transforms: Transform[];
  options?: PullOptions;
} {
  const values = [...args];
  const last = values.at(-1);
  const options =
    last !== undefined && isPullOptions(last) ? (values.pop() as PullOptions) : undefined;
  values.forEach((transform, index) => {
    if (!isTransform(transform)) {
      throw invalidArgType(
        `transforms[${index}]`,
        ["Function", "Object with transform()"],
        transform,
      );
    }
  });
  validateAbortSignal(options?.signal);
  return { transforms: values as Transform[], options };
}

function syncTransformSource(
  source: SyncByteReadableStream,
  transform: SyncTransform,
): SyncByteReadableStream {
  if (isTransformObject(transform)) {
    const withFlush = {
      *[Symbol.iterator](): Iterator<ByteBatch | null> {
        yield* source;
        yield null;
      },
    };
    return fromSync(transform.transform(withFlush) as SyncSource);
  }
  const callback = transform as SyncStatelessTransform;
  return {
    *[Symbol.iterator](): Iterator<ByteBatch> {
      for (const batch of source) {
        const result = callback(batch);
        if (result !== null) {
          yield* fromSync(result);
        }
      }
      const flushed = callback(null);
      if (flushed !== null) {
        yield* fromSync(flushed);
      }
    },
  };
}

function asyncTransformSource(
  source: ByteReadableStream,
  transform: Transform,
  signal: AbortSignal,
): ByteReadableStream {
  if (isTransformObject(transform)) {
    const withFlush = {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch | null> {
        yield* source;
        yield null;
      },
    };
    return from(transform.transform(withFlush, { signal }) as Source);
  }
  const callback = transform as StatelessTransform;
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
      for await (const batch of source) {
        signal.throwIfAborted();
        const result = await callback(batch, { signal });
        if (result !== null) {
          yield* from(result);
        }
      }
      const flushed = await callback(null, { signal });
      if (flushed !== null) {
        yield* from(flushed);
      }
    },
  };
}

export function pullSync(
  source: SyncSource,
  ...transforms: SyncTransform[]
): SyncByteReadableStream {
  let pipeline = fromSync(source);
  transforms.forEach((transform, index) => {
    if (!isTransform(transform)) {
      throw invalidArgType(
        `transforms[${index}]`,
        ["Function", "Object with transform()"],
        transform,
      );
    }
    pipeline = syncTransformSource(pipeline, transform);
  });
  return pipeline;
}

export function pull(source: Source, ...args: Array<Transform | PullOptions>): ByteReadableStream {
  const { transforms, options } = parsePullArgs(args);
  const controller = new AbortController();
  const signal =
    options?.signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, options.signal]);
  let pipeline = from(source);
  for (const transform of transforms) {
    pipeline = asyncTransformSource(pipeline, transform, signal);
  }
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
      signal.throwIfAborted();
      try {
        yield* pipeline;
      } finally {
        controller.abort();
      }
    },
  };
}

function isWriter(value: unknown): value is PartialWriter {
  return isObject(value) && typeof value.write === "function";
}

function isSyncWriter(value: unknown): value is PartialSyncWriter {
  return isObject(value) && typeof value.writeSync === "function";
}

function parsePipeArgs(args: unknown[]): {
  transforms: Transform[];
  writer: PartialWriter;
  options?: PipeToOptions;
} {
  const values = [...args];
  const last = values.at(-1);
  const options =
    last !== undefined && isPullOptions(last) ? (values.pop() as PipeToOptions) : undefined;
  const writer = values.pop();
  if (!isWriter(writer)) {
    throw invalidArgType("writer", "Object with write()", writer);
  }
  values.forEach((transform, index) => {
    if (!isTransform(transform)) {
      throw invalidArgType(
        `transforms[${index}]`,
        ["Function", "Object with transform()"],
        transform,
      );
    }
  });
  validateAbortSignal(options?.signal);
  return { transforms: values as Transform[], writer, options };
}

async function writeBatch(
  writer: PartialWriter,
  batch: ByteBatch,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof writer.writevSync === "function" && writer.writevSync(batch)) {
    return;
  }
  if (typeof writer.writev === "function") {
    await writer.writev(batch, { signal });
    return;
  }
  for (const chunk of batch) {
    if (typeof writer.writeSync === "function" && writer.writeSync(chunk)) {
      continue;
    }
    await writer.write(chunk, { signal });
  }
}

export async function pipeTo(source: Source, ...args: unknown[]): Promise<number> {
  const { transforms, writer, options } = parsePipeArgs(args);
  let total = 0;
  try {
    for await (const batch of pull(source, ...transforms, options ?? {})) {
      options?.signal?.throwIfAborted();
      await writeBatch(writer, batch, options?.signal);
      total += batch.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    }
    if (!options?.preventClose) {
      const syncResult = typeof writer.endSync === "function" ? writer.endSync() : -1;
      if (syncResult < 0 && typeof writer.end === "function") {
        await writer.end({ signal: options?.signal });
      }
    }
    return total;
  } catch (error) {
    if (!options?.preventFail && typeof writer.fail === "function") {
      writer.fail(error);
    }
    throw error;
  }
}

function parseSyncPipeArgs(args: unknown[]): {
  transforms: SyncTransform[];
  writer: PartialSyncWriter;
  options?: PipeToSyncOptions;
} {
  const values = [...args];
  const last = values.at(-1);
  const options =
    last !== undefined && isPullOptions(last) ? (values.pop() as PipeToSyncOptions) : undefined;
  const writer = values.pop();
  if (!isSyncWriter(writer)) {
    throw invalidArgType("writer", "Object with writeSync()", writer);
  }
  values.forEach((transform, index) => {
    if (!isTransform(transform)) {
      throw invalidArgType(
        `transforms[${index}]`,
        ["Function", "Object with transform()"],
        transform,
      );
    }
  });
  return { transforms: values as SyncTransform[], writer, options };
}

export function pipeToSync(source: SyncSource, ...args: unknown[]): number {
  const { transforms, writer, options } = parseSyncPipeArgs(args);
  let total = 0;
  try {
    for (const batch of pullSync(source, ...transforms)) {
      if (typeof writer.writevSync === "function") {
        const accepted = writer.writevSync(batch);
        if (accepted === false || accepted === -1) {
          throw new Error("The synchronous writer did not accept the batch");
        }
      } else {
        for (const chunk of batch) {
          const accepted = writer.writeSync(chunk);
          if (accepted === false || accepted === -1) {
            throw new Error("The synchronous writer did not accept the chunk");
          }
        }
      }
      total += batch.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    }
    if (!options?.preventClose && typeof writer.endSync === "function") {
      writer.endSync();
    }
    return total;
  } catch (error) {
    if (!options?.preventFail && typeof writer.fail === "function") {
      writer.fail(error);
    }
    throw error;
  }
}

export function asByteChunk(value: unknown): Uint8Array {
  return toUint8Array(value);
}
