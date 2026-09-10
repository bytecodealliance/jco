/**
 * Opt-in Node host adapter for the terminal capability.
 *
 * Descriptors are the embedding process's own. A handle is Node's real `tty.ReadStream` or
 * `tty.WriteStream` on the descriptor, which is where Node's exact `ERR_TTY_INIT_FAILED` comes
 * from; input and output themselves go through `fs.readSync`/`fs.writeSync`, so libuv never
 * competes with the guest for the terminal's bytes and reads block as the guest expects.
 */
import { readSync, writeSync } from "node:fs";
import { Buffer } from "node:buffer";
import nodeProcess from "node:process";
import { ReadStream as NodeReadStream, WriteStream as NodeWriteStream, isatty } from "node:tty";

import { captureTtyCall } from "./tty/host-utils.js";
import { errorRecord } from "./internal/host-error.js";
import type { TtyDirection, TtyEnvironment, TtyProvider } from "./tty/types.js";

interface Handle {
  stream: NodeReadStream | NodeWriteStream;
  refs: number;
}

const handles = new Map<string, Handle>();

const key = (fd: number, direction: TtyDirection): string => `${direction}:${fd}`;

/** How long to wait before retrying a descriptor that is in non-blocking mode. */
const RETRY_MS = 5;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function wouldBlock(error: unknown): boolean {
  const code = errorRecord(error).code;
  return code === "EAGAIN" || code === "EWOULDBLOCK";
}

/** Run `operation` and rethrow an `'error'` the stream emitted during it, as Node's tty does. */
function captureEmittedError<T>(stream: NodeReadStream | NodeWriteStream, operation: () => T): T {
  let emitted: unknown;
  const onError = (error: unknown): void => {
    emitted = error;
  };
  stream.on("error", onError);
  try {
    const result = operation();
    if (emitted !== undefined) {
      throw emitted;
    }
    return result;
  } finally {
    stream.off("error", onError);
  }
}

function descriptorError(syscall: string, fd: number): Error {
  return Object.assign(new Error(`${syscall} EBADF: no open terminal handle for fd ${fd}`), {
    code: "EBADF",
    errno: -9,
    syscall,
  });
}

function readHandle(fd: number): NodeReadStream {
  const stream = handles.get(key(fd, "read"))?.stream;
  if (!(stream instanceof NodeReadStream)) {
    throw descriptorError("setRawMode", fd);
  }
  return stream;
}

function writeHandle(fd: number): NodeWriteStream {
  const stream = handles.get(key(fd, "write"))?.stream;
  if (!(stream instanceof NodeWriteStream)) {
    throw descriptorError("getWindowSize", fd);
  }
  return stream;
}

export const isTty: TtyProvider["isTty"] = (fd) => captureTtyCall(() => isatty(fd));

export const open: TtyProvider["open"] = (fd, direction) =>
  captureTtyCall(() => {
    const entry = handles.get(key(fd, direction));
    if (entry) {
      entry.refs += 1;
      return;
    }
    const stream = direction === "read" ? new NodeReadStream(fd) : new NodeWriteStream(fd);
    // The read handle only carries raw mode; it must never start reading itself.
    stream.pause();
    // An idle handle must not keep the embedding process alive.
    stream.unref();
    handles.set(key(fd, direction), { stream, refs: 1 });
  });

export const close: TtyProvider["close"] = (fd, direction) =>
  captureTtyCall(() => {
    const id = key(fd, direction);
    const entry = handles.get(id);
    if (!entry) {
      return;
    }
    entry.refs -= 1;
    if (entry.refs > 0) {
      return;
    }
    handles.delete(id);
    if (entry.stream instanceof NodeReadStream && entry.stream.isRaw) {
      entry.stream.setRawMode(false);
    }
    // The standard descriptors are shared with the embedding process and stay open, as Node
    // keeps its own stdio open; anything else is the application's to close.
    if (fd > 2) {
      entry.stream.destroy();
    }
  });

export const windowSize: TtyProvider["windowSize"] = (fd) =>
  captureTtyCall(() => {
    const stream = writeHandle(fd);
    const refresh = (stream as { _refreshSize?: () => void })._refreshSize;
    if (typeof refresh === "function") {
      captureEmittedError(stream, () => refresh.call(stream));
    }
    const [columns, rows] = stream.getWindowSize();
    if (typeof columns !== "number" || typeof rows !== "number") {
      throw Object.assign(new Error("getWindowSize ENOTSUP: the terminal reports no size"), {
        code: "ENOTSUP",
        syscall: "getWindowSize",
      });
    }
    return { columns, rows };
  });

export const setRawMode: TtyProvider["setRawMode"] = (fd, enabled) =>
  captureTtyCall(() => {
    const stream = readHandle(fd);
    captureEmittedError(stream, () => stream.setRawMode(enabled));
  });

export const read: TtyProvider["read"] = (fd, maxBytes) =>
  captureTtyCall(() => {
    const buffer = Buffer.allocUnsafe(Math.max(1, maxBytes));
    for (;;) {
      try {
        const length = readSync(fd, buffer, 0, buffer.length, null);
        return new Uint8Array(buffer.subarray(0, length));
      } catch (error) {
        if (wouldBlock(error)) {
          sleep(RETRY_MS);
          continue;
        }
        // A hung-up pseudo-terminal reads as EIO on Linux; libuv reports both as end of input.
        const code = errorRecord(error).code;
        if (code === "EOF" || code === "EIO") {
          return new Uint8Array(0);
        }
        throw error;
      }
    }
  });

export const write: TtyProvider["write"] = (fd, data) =>
  captureTtyCall(() => {
    let offset = 0;
    while (offset < data.byteLength) {
      try {
        offset += writeSync(fd, data, offset, data.byteLength - offset);
      } catch (error) {
        if (!wouldBlock(error)) {
          throw error;
        }
        sleep(RETRY_MS);
      }
    }
  });

export const environment: TtyProvider["environment"] = () =>
  captureTtyCall(
    (): TtyEnvironment =>
      Object.entries(nodeProcess.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
  );

const host: TtyProvider = {
  isTty,
  open,
  close,
  windowSize,
  setRawMode,
  read,
  write,
  environment,
};

export default host;
