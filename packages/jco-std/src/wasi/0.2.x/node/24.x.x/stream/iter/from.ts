/**
 * Iterable byte-stream source normalization.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/from.js (MIT license). Local changes replace
 * primordials and Node internal type guards with portable TypeScript helpers.
 */

import { invalidArgType } from "../../errors/core.js";

import {
  isAsyncIterable,
  isObject,
  isPrimitiveChunk,
  isPromiseLike,
  isSyncIterable,
  primitiveToUint8Array,
} from "../shared.js";
import {
  toAsyncStreamable,
  toStreamable,
  type ByteBatch,
  type ByteReadableStream,
  type Source,
  type SyncByteReadableStream,
  type SyncSource,
} from "./types.js";

const FROM_BATCH_SIZE = 128;

function hasMethod(
  value: unknown,
  key: PropertyKey,
): value is Record<PropertyKey, (...args: never[]) => unknown> {
  return isObject(value) && typeof value[key] === "function";
}

function isByteBatch(value: unknown): value is ByteBatch {
  return Array.isArray(value) && value.every((chunk) => chunk instanceof Uint8Array);
}

function* bounded(batch: ByteBatch): Iterable<ByteBatch> {
  for (let index = 0; index < batch.length; index += FROM_BATCH_SIZE) {
    yield batch.slice(index, index + FROM_BATCH_SIZE);
  }
}

function* normalizeSyncValue(value: unknown): Iterable<Uint8Array> {
  if (isPrimitiveChunk(value)) {
    yield primitiveToUint8Array(value);
    return;
  }
  if (hasMethod(value, toStreamable)) {
    yield* normalizeSyncValue(Reflect.apply(value[toStreamable], value, []));
    return;
  }
  if (isSyncIterable(value)) {
    for (const item of value) {
      yield* normalizeSyncValue(item);
    }
    return;
  }
  throw invalidArgType(
    "value",
    ["string", "ArrayBuffer", "ArrayBufferView", "Iterable", "toStreamable"],
    value,
  );
}

function* normalizeSyncSource(source: Iterable<unknown>): Iterable<ByteBatch> {
  let batch: ByteBatch = [];
  for (const value of source) {
    if (isByteBatch(value)) {
      if (batch.length > 0) {
        yield batch;
        batch = [];
      }
      yield* bounded(value);
      continue;
    }
    if (value instanceof Uint8Array) {
      batch.push(value);
      if (batch.length === FROM_BATCH_SIZE) {
        yield batch;
        batch = [];
      }
      continue;
    }
    if (batch.length > 0) {
      yield batch;
      batch = [];
    }
    const normalized = [...normalizeSyncValue(value)];
    yield* bounded(normalized);
  }
  if (batch.length > 0) {
    yield batch;
  }
}

async function* normalizeAsyncValue(
  value: unknown,
  allowNestedAsync = true,
): AsyncIterable<Uint8Array> {
  if (isPromiseLike(value)) {
    yield* normalizeAsyncValue(await value, allowNestedAsync);
    return;
  }
  if (isPrimitiveChunk(value)) {
    yield primitiveToUint8Array(value);
    return;
  }
  if (!allowNestedAsync && (isAsyncIterable(value) || hasMethod(value, toAsyncStreamable))) {
    throw invalidArgType(
      "value",
      ["string", "ArrayBuffer", "ArrayBufferView", "Iterable", "toStreamable"],
      value,
    );
  }
  if (hasMethod(value, toAsyncStreamable)) {
    yield* normalizeAsyncValue(
      await Reflect.apply(value[toAsyncStreamable], value, []),
      allowNestedAsync,
    );
    return;
  }
  if (hasMethod(value, toStreamable)) {
    yield* normalizeAsyncValue(Reflect.apply(value[toStreamable], value, []), allowNestedAsync);
    return;
  }
  if (isAsyncIterable(value)) {
    for await (const item of value) {
      yield* normalizeAsyncValue(item, allowNestedAsync);
    }
    return;
  }
  if (isSyncIterable(value)) {
    for (const item of value) {
      yield* normalizeAsyncValue(item, allowNestedAsync);
    }
    return;
  }
  throw invalidArgType(
    "value",
    [
      "string",
      "ArrayBuffer",
      "ArrayBufferView",
      "Iterable",
      "AsyncIterable",
      "toStreamable",
      "toAsyncStreamable",
    ],
    value,
  );
}

async function* normalizeAsyncSource(
  source: Iterable<unknown> | AsyncIterable<unknown>,
): ByteReadableStream {
  if (isAsyncIterable(source)) {
    for await (const value of source) {
      if (isByteBatch(value)) {
        if (value.length > 0) {
          yield* bounded(value);
        }
      } else if (value instanceof Uint8Array) {
        yield [value];
      } else {
        const batch: ByteBatch = [];
        for await (const chunk of normalizeAsyncValue(value)) {
          batch.push(chunk);
          if (batch.length === FROM_BATCH_SIZE) {
            yield batch.splice(0);
          }
        }
        if (batch.length > 0) {
          yield batch;
        }
      }
    }
    return;
  }
  for (const batch of normalizeSyncSource(source)) {
    yield batch;
  }
}

export function fromSync(input: SyncSource): SyncByteReadableStream {
  if (input === null || input === undefined) {
    throw invalidArgType("input", "a non-null value", input);
  }
  if (isPrimitiveChunk(input)) {
    const chunk = primitiveToUint8Array(input);
    return {
      *[Symbol.iterator](): Iterator<ByteBatch> {
        yield [chunk];
      },
    };
  }
  if (isByteBatch(input)) {
    return {
      *[Symbol.iterator](): Iterator<ByteBatch> {
        yield* bounded(input);
      },
    };
  }
  if (hasMethod(input, toStreamable)) {
    return fromSync(Reflect.apply(input[toStreamable], input, []) as SyncSource);
  }
  if (!isSyncIterable(input)) {
    const expected =
      isAsyncIterable(input) || isPromiseLike(input)
        ? "a synchronous input (not AsyncIterable or Promise)"
        : ["string", "ArrayBuffer", "ArrayBufferView", "Iterable", "toStreamable"];
    throw invalidArgType("input", expected, input);
  }
  return {
    *[Symbol.iterator](): Iterator<ByteBatch> {
      yield* normalizeSyncSource(input);
    },
  };
}

export function from(input: Source): ByteReadableStream {
  if (input === null || input === undefined) {
    throw invalidArgType("input", "a non-null value", input);
  }
  if (isPrimitiveChunk(input)) {
    const chunk = primitiveToUint8Array(input);
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
        yield [chunk];
      },
    };
  }
  if (isByteBatch(input)) {
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
        yield* bounded(input);
      },
    };
  }
  if (hasMethod(input, toAsyncStreamable)) {
    const result = Reflect.apply(input[toAsyncStreamable], input, []);
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
        yield* from((await result) as Source);
      },
    };
  }
  if (hasMethod(input, toStreamable)) {
    return from(Reflect.apply(input[toStreamable], input, []) as Source);
  }
  if (isPromiseLike(input)) {
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<ByteBatch> {
        yield* from((await input) as Source);
      },
    };
  }
  if (!isSyncIterable(input) && !isAsyncIterable(input)) {
    throw invalidArgType(
      "input",
      [
        "string",
        "ArrayBuffer",
        "ArrayBufferView",
        "Iterable",
        "AsyncIterable",
        "toStreamable",
        "toAsyncStreamable",
      ],
      input,
    );
  }
  return normalizeAsyncSource(input);
}
