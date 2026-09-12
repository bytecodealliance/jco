/**
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/webstreams/adapters.js (MIT).
 * Local changes use public Web Stream readers/controllers, typed promises,
 * portable errors, and readable-stream instead of Node's internal bindings.
 */
import { validateObject, validateBoolean } from "../internal/validation.js";
import {
  invalidArgType,
  invalidArgValue,
  codedError,
  AbortError,
  deprecatedNodeApi,
} from "../errors/core.js";
import { core } from "./core.js";
import { nextTick } from "./scheduler.js";
import type {
  Callback,
  Duplex,
  DuplexOptions,
  Readable,
  ReadableOptions,
  Writable,
  WritableOptions,
} from "./types.js";

function booleanOption(value: unknown, name: string): void {
  if (value !== undefined) {
    validateBoolean(value, name);
  }
}

function validateSignal(signal: AbortSignal | undefined): void {
  if (
    signal !== undefined &&
    (!signal ||
      typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function")
  ) {
    throw invalidArgType("options.signal", "AbortSignal", signal);
  }
}

export function streamError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function abortError(): Error {
  return new AbortError();
}

function done(callback: Callback, error?: unknown): void {
  // Stream callbacks may throw. Escape the promise reaction so that such throws
  // are reported as exceptions, rather than abandoned rejected promises.
  try {
    callback(error == null ? undefined : streamError(error));
  } catch (failure) {
    nextTick((): void => {
      throw failure;
    });
  }
}

export function fromReadableWeb<T>(
  source: ReadableStream<T>,
  options: ReadableOptions = {},
): Readable<T> {
  if (!source || typeof source.getReader !== "function") {
    throw invalidArgType("readableStream", "ReadableStream", source);
  }
  validateObject(options, "options", { allowArray: true });
  booleanOption(options.objectMode, "options.objectMode");
  validateSignal(options.signal);
  // Construct before locking: invalid stream options must not consume a reader.
  let reader: ReadableStreamDefaultReader<T> | undefined = undefined;
  let closed = false;
  const readable = new core.Readable<T>({
    objectMode: options.objectMode,
    highWaterMark: options.highWaterMark,
    encoding: options.encoding,
    read(): void {
      reader!.read().then(
        (chunk): void => {
          readable.push(chunk.done ? null : chunk.value);
        },
        (error: unknown): void => {
          readable.destroy(streamError(error));
        },
      );
    },
    destroy(error: Error | null, callback: Callback): void {
      if (!reader || closed) {
        done(callback, error);
        return;
      }
      reader.cancel(error).then(
        (): void => done(callback, error),
        (): void => done(callback, error),
      );
    },
  });
  reader = source.getReader();
  reader.closed.then(
    (): void => {
      closed = true;
    },
    (error: unknown): void => {
      closed = true;
      readable.destroy(streamError(error));
    },
  );
  if (options.signal) {
    core.addAbortSignal(options.signal, readable);
  }
  return readable;
}

export function fromWritableWeb(source: WritableStream, options: WritableOptions = {}): Writable {
  if (!source || typeof source.getWriter !== "function") {
    throw invalidArgType("writableStream", "WritableStream", source);
  }
  validateObject(options, "options", { allowArray: true });
  booleanOption(options.objectMode, "options.objectMode");
  booleanOption(options.decodeStrings, "options.decodeStrings");
  validateSignal(options.signal);
  let writer: WritableStreamDefaultWriter | undefined = undefined;
  let closed = false;
  const writable = new core.Writable({
    objectMode: options.objectMode,
    highWaterMark: options.highWaterMark,
    decodeStrings: options.decodeStrings,
    write(chunk: unknown, _encoding: string, callback: Callback): void {
      writer!.ready
        .then(() => writer!.write(chunk))
        .then(
          (): void => done(callback),
          (error: unknown): void => done(callback, error),
        );
    },
    writev(chunks: Array<{ chunk: unknown; encoding: string }>, callback: Callback): void {
      writer!.ready
        .then(() => Promise.all(chunks.map((entry) => writer!.write(entry.chunk))))
        .then(
          (): void => done(callback),
          (error: unknown): void => done(callback, error),
        );
    },
    final(callback: Callback): void {
      if (closed) {
        done(callback);
        return;
      }
      writer!.close().then(
        (): void => done(callback),
        (error: unknown): void => done(callback, error),
      );
    },
    destroy(error: Error | null, callback: Callback): void {
      if (!writer || closed) {
        done(callback, error);
        return;
      }
      (error ? writer.abort(error) : writer!.close()).then(
        (): void => done(callback, error),
        (): void => done(callback, error),
      );
    },
  });
  writer = source.getWriter();
  writer.closed.then(
    (): void => {
      closed = true;
      if (!writable.writableEnded) {
        writable.destroy(codedError(new Error("Premature close"), "ERR_STREAM_PREMATURE_CLOSE"));
      }
    },
    (error: unknown): void => {
      closed = true;
      writable.destroy(streamError(error));
    },
  );
  if (options.signal) {
    core.addAbortSignal(options.signal, writable);
  }
  return writable;
}

export function toReadableWeb<T>(
  source: Readable<T>,
  options: { strategy?: QueuingStrategy<T>; type?: "bytes" } = {},
): ReadableStream<T> {
  if (!source || typeof source.read !== "function" || typeof source.on !== "function") {
    throw invalidArgType("streamReadable", "stream.Readable", source);
  }
  validateObject(options, "options", { allowArray: true });
  if (options.type !== undefined && options.type !== "bytes") {
    throw invalidArgValue("options.type", options.type);
  }
  const bytes = options.type === "bytes";
  let controller: ReadableStreamDefaultController<T> | ReadableByteStreamController;
  let canceled = false;
  const onData = (value: unknown): void => {
    // Byte controllers transfer their input buffer. Copy to avoid detaching
    // buffers still owned by the classic stream or application.
    const chunk =
      !source.readableObjectMode && value instanceof Uint8Array ? new Uint8Array(value) : value;
    if (bytes) {
      (controller as ReadableByteStreamController).enqueue(chunk as Uint8Array<ArrayBuffer>);
    } else {
      (controller as ReadableStreamDefaultController<T>).enqueue(chunk as T);
    }
    if ((controller.desiredSize ?? 0) <= 0) {
      source.pause();
    }
  };
  const underlying = {
    start(value: ReadableStreamDefaultController<T> | ReadableByteStreamController): void {
      controller = value;
    },
    pull(): void {
      source.resume();
    },
    cancel(reason: unknown): void {
      canceled = true;
      source.destroy(reason == null ? undefined : streamError(reason));
    },
  };
  const highWaterMark = source.readableHighWaterMark;
  const readable = bytes
    ? (new ReadableStream({ ...underlying, type: "bytes" }, { highWaterMark }) as ReadableStream<T>)
    : new ReadableStream<T>(
        underlying,
        options.strategy ?? {
          highWaterMark,
          size(chunk: T): number {
            return !source.readableObjectMode && ArrayBuffer.isView(chunk) ? chunk.byteLength : 1;
          },
        },
      );
  let cleanup = (): void => {};
  cleanup = core.finished(source, { writable: false }, (error): void => {
    cleanup();
    source.off("data", onData);
    if (canceled) {
      return;
    }
    canceled = true;
    if (error) {
      controller.error(error);
    } else {
      controller.close();
      if (bytes) {
        (controller as ReadableByteStreamController).byobRequest?.respond(0);
      }
    }
  });
  source.pause();
  source.on("data", onData);
  return readable;
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej): void => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function toWritableWeb(source: Writable): WritableStream {
  if (!source || typeof source.write !== "function" || typeof source.on !== "function") {
    throw invalidArgType("streamWritable", "stream.Writable", source);
  }
  if (source.destroyed || !source.writable) {
    const closed = new WritableStream();
    void closed.close();
    return closed;
  }
  let controller: WritableStreamDefaultController;
  let draining: Deferred | undefined;
  let closing: Deferred | undefined;
  const onDrain = (): void => draining?.resolve();
  let cleanup = (): void => {};
  cleanup = core.finished(source, { readable: false }, (error): void => {
    cleanup();
    source.off("drain", onDrain);
    if (error) {
      draining?.reject(error);
      closing?.reject(error);
      controller.error(error);
    } else if (closing) {
      closing.resolve();
    } else {
      controller.error(abortError());
    }
  });
  source.on("drain", onDrain);
  return new WritableStream(
    {
      start(value): void {
        controller = value;
      },
      write(chunk: unknown): void | Promise<void> {
        if (!source.writableObjectMode && chunk instanceof ArrayBuffer) {
          chunk = new Uint8Array(chunk);
        }
        if (!source.write(chunk)) {
          draining = deferred();
          if (!source.writableNeedDrain) {
            draining.resolve();
          }
          return draining.promise.finally((): void => {
            draining = undefined;
          });
        }
      },
      close(): Promise<void> {
        closing = deferred();
        source.end();
        return closing.promise;
      },
      abort(reason: unknown): void {
        source.destroy(reason == null ? undefined : streamError(reason));
      },
    },
    {
      highWaterMark: source.writableHighWaterMark,
      size(chunk: unknown): number {
        return !source.writableObjectMode && ArrayBuffer.isView(chunk) ? chunk.byteLength : 1;
      },
    },
  );
}

export function fromDuplexWeb(pair: ReadableWritablePair, options: DuplexOptions = {}): Duplex {
  if (!pair || typeof pair !== "object") {
    throw invalidArgType("pair", "Object", pair);
  }
  if (!pair.readable || typeof pair.readable.getReader !== "function") {
    throw invalidArgType("pair.readable", "ReadableStream", pair.readable);
  }
  if (!pair.writable || typeof pair.writable.getWriter !== "function") {
    throw invalidArgType("pair.writable", "WritableStream", pair.writable);
  }
  validateObject(options, "options", { allowArray: true });
  // Validate lock ownership before acquiring either side.
  if (pair.readable.locked || pair.writable.locked) {
    throw invalidArgValue("pair", pair, "must contain unlocked streams");
  }
  booleanOption(options.objectMode, "options.objectMode");
  booleanOption(options.decodeStrings, "options.decodeStrings");
  validateSignal(options.signal);
  booleanOption(options.allowHalfOpen, "options.allowHalfOpen");
  let reader: ReadableStreamDefaultReader | undefined = undefined;
  let writer: WritableStreamDefaultWriter | undefined = undefined;
  let readableClosed = false;
  let writableClosed = false;
  const duplex = new core.Duplex({
    objectMode: options.objectMode,
    highWaterMark: options.highWaterMark,
    encoding: options.encoding,
    decodeStrings: options.decodeStrings,
    allowHalfOpen: options.allowHalfOpen ?? false,
    read(): void {
      reader!.read().then(
        (chunk): void => {
          duplex.push(chunk.done ? null : chunk.value);
        },
        (error: unknown): void => {
          duplex.destroy(streamError(error));
        },
      );
    },
    write(chunk: unknown, _encoding: string, callback: Callback): void {
      writer!.ready
        .then(() => writer!.write(chunk))
        .then(
          (): void => done(callback),
          (error: unknown): void => done(callback, error),
        );
    },
    writev(chunks: Array<{ chunk: unknown; encoding: string }>, callback: Callback): void {
      writer!.ready
        .then(() => Promise.all(chunks.map((entry) => writer!.write(entry.chunk))))
        .then(
          (): void => done(callback),
          (error: unknown): void => done(callback, error),
        );
    },
    final(callback: Callback): void {
      if (writableClosed) {
        done(callback);
        return;
      }
      writer!.close().then(
        (): void => done(callback),
        (error: unknown): void => done(callback, error),
      );
    },
    destroy(error: Error | null, callback: Callback): void {
      const tasks: Promise<unknown>[] = [];
      if (reader && !readableClosed) {
        tasks.push(reader.cancel(error));
      }
      if (writer && !writableClosed) {
        tasks.push(error ? writer.abort(error) : writer!.close());
      }
      Promise.allSettled(tasks).then((): void => done(callback, error));
    },
  });
  reader = pair.readable.getReader();
  try {
    writer = pair.writable.getWriter();
  } catch (error) {
    reader.releaseLock();
    throw error;
  }
  reader.closed.then(
    (): void => {
      readableClosed = true;
    },
    (error: unknown): void => {
      readableClosed = true;
      duplex.destroy(streamError(error));
    },
  );
  writer.closed.then(
    (): void => {
      writableClosed = true;
      if (!duplex.writableEnded) {
        duplex.destroy(codedError(new Error("Premature close"), "ERR_STREAM_PREMATURE_CLOSE"));
      }
    },
    (error: unknown): void => {
      writableClosed = true;
      duplex.destroy(streamError(error));
    },
  );
  if (options.signal) {
    core.addAbortSignal(options.signal, duplex);
  }
  return duplex;
}

export function toDuplexWeb(
  source: Duplex,
  options: { readableType?: "bytes" } = {},
): ReadableWritablePair {
  if (options && Object.prototype.hasOwnProperty.call(options, "type")) {
    throw deprecatedNodeApi("Duplex.toWeb({ type })", "options.readableType");
  }
  validateObject(options, "options", { allowArray: true });
  return {
    readable: toReadableWeb(source, { type: options.readableType }),
    writable: toWritableWeb(source),
  };
}
