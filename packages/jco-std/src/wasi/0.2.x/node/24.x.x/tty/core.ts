// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/tty.js.
// Local changes: TypeScript types; the `tty_wrap` binding becomes the
// `jco:node/tty` provider, addressed by descriptor; `net.Socket` becomes the
// portable `stream.Duplex` with the unused side disabled; reads are blocking
// pulls from the provider. See ./README.md for runtime boundaries.

import { Duplex } from "../stream/index.js";
import { clearLine, clearScreenDown, cursorTo, moveCursor } from "../readline/callbacks.js";
import { codedError, invalidArgType, systemError } from "../errors/core.js";
import { callHost, decodeErrno } from "../internal/host-error.js";
import { createColorFunctions } from "./colors.js";
import type { Callback } from "../stream/types.js";
import type {
  ColorEnvironment,
  ReadStreamConstructor,
  ReadStreamOptions,
  TtyError,
  TtyModule,
  TtyProvider,
  TtyResult,
  WriteStreamConstructor,
} from "./types.js";

/** libuv's default terminal read allocation; the provider returns at most this much per pull. */
const READ_CHUNK_BYTES = 64 * 1024;

/** Node's `ERR_INVALID_FD`. */
function invalidFd(fd: unknown): RangeError {
  return codedError(
    new RangeError(`"fd" must be a positive integer: ${String(fd)}`),
    "ERR_INVALID_FD",
  );
}

/** Rebuild the error a provider serialized: Node's `ERR_TTY_INIT_FAILED` carries `info`. */
function providerError(record: TtyError): Error {
  const info = record.info
    ? {
        errno: decodeErrno(record.info.errno),
        code: record.info.code,
        message: record.info.message,
        syscall: record.info.syscall,
      }
    : undefined;
  const error = systemError({
    message: record.message,
    code: record.code ?? "ERR_JCO_TTY_HOST",
    errno: decodeErrno(record.errno),
    syscall: record.syscall,
    info,
  });
  if (record.name !== "Error") {
    error.name = record.name;
  }
  return error;
}

function bytesOf(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw invalidArgType("chunk", ["string", "Buffer", "TypedArray", "DataView"], chunk);
}

/** Node's constructors are plain functions: calling one without `new` constructs. */
function constructible<T extends abstract new (...args: never[]) => unknown>(target: T): T {
  const callable = new Proxy(target, {
    apply(callee, _thisArgument, argumentsList: unknown[]) {
      return Reflect.construct(callee, argumentsList);
    },
  });
  Object.defineProperty(target.prototype, "constructor", {
    value: callable,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return callable;
}

/** Node assigns these prototype members, so they are enumerable own keys of the prototype. */
function enumerable(prototype: object, keys: readonly string[]): void {
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor) {
      Object.defineProperty(prototype, key, { ...descriptor, enumerable: true });
    }
  }
}

/** Create the `node:tty` module over an explicit terminal provider. */
export function createTty(host: TtyProvider): TtyModule {
  const call = <T>(operation: () => T | TtyResult<T>): T => callHost(operation, providerError);

  function validateFd(fd: unknown): asserts fd is number {
    if ((fd as number) >> 0 !== fd || (fd as number) < 0) {
      throw invalidFd(fd);
    }
  }

  function isatty(fd: unknown): boolean {
    return (
      Number.isInteger(fd) &&
      (fd as number) >= 0 &&
      (fd as number) <= 2147483647 &&
      call(() => host.isTty(fd as number))
    );
  }

  const { getColorDepth, hasColors } = createColorFunctions(
    (): ColorEnvironment => Object.fromEntries(call(() => host.environment())),
  );

  // Node's tty streams are `net.Socket`s over a `TTY` handle, and the stream plumbing
  // (`_read`, `_write`, `_destroy`) lives on `Socket.prototype`. These two classes stand in for
  // the socket so that `ReadStream.prototype` and `WriteStream.prototype` carry exactly the own
  // members Node's do.
  class TerminalInput extends Duplex {
    readonly #fd: number;

    constructor(fd: number, options?: ReadStreamOptions) {
      super({ readableHighWaterMark: 0, ...options, writable: false });
      this.#fd = fd;
    }

    protected get fd(): number {
      return this.#fd;
    }

    // A pull blocks the component until the terminal has input; the flowing loop then emits
    // `'data'` synchronously between pulls. An empty read is the terminal's end of input.
    override _read(): void {
      let bytes: Uint8Array;
      try {
        bytes = call(() => host.read(this.fd, READ_CHUNK_BYTES));
      } catch (error) {
        this.destroy(error as Error);
        return;
      }
      this.push(bytes.byteLength === 0 ? null : bytes);
    }

    override _destroy(error: Error | null, callback: Callback): void {
      try {
        call(() => host.close(this.fd, "read"));
      } catch (closeError) {
        callback(error ?? (closeError as Error));
        return;
      }
      callback(error);
    }
  }

  class TerminalOutput extends Duplex {
    readonly #fd: number;

    constructor(fd: number) {
      super({ readableHighWaterMark: 0, readable: false });
      this.#fd = fd;
    }

    protected get fd(): number {
      return this.#fd;
    }

    override _write(chunk: unknown, _encoding: string, callback: Callback): void {
      try {
        const bytes = bytesOf(chunk);
        call(() => host.write(this.fd, bytes));
      } catch (error) {
        callback(error as Error);
        return;
      }
      callback();
    }

    override _destroy(error: Error | null, callback: Callback): void {
      try {
        call(() => host.close(this.fd, "write"));
      } catch (closeError) {
        callback(error ?? (closeError as Error));
        return;
      }
      callback(error);
    }
  }

  class ReadStream extends TerminalInput {
    isRaw = false;
    isTTY = true;

    constructor(fd: unknown, options?: ReadStreamOptions) {
      validateFd(fd);
      // Node's `new TTY(fd)` runs before the stream exists: an `ERR_TTY_INIT_FAILED` leaves
      // nothing behind to close.
      call(() => host.open(fd, "read"));
      super(fd, options);
    }

    setRawMode(flag: unknown): this {
      const enabled = !!flag;
      try {
        call(() => host.setRawMode(this.fd, enabled));
      } catch (error) {
        this.emit("error", error);
        return this;
      }
      this.isRaw = enabled;
      return this;
    }
  }

  class WriteStream extends TerminalOutput {
    declare isTTY: boolean;
    declare columns: number | undefined;
    declare rows: number | undefined;

    constructor(fd: unknown) {
      validateFd(fd);
      call(() => host.open(fd, "write"));
      super(fd);

      // Node keeps `columns`/`rows` absent when the terminal reports no size.
      const size = this.#windowSize();
      if (size) {
        this.columns = size.columns;
        this.rows = size.rows;
      }
    }

    #windowSize(): { columns: number; rows: number } | undefined {
      try {
        return call(() => host.windowSize(this.fd));
      } catch {
        return undefined;
      }
    }

    getColorDepth(env?: ColorEnvironment): number {
      return getColorDepth(env);
    }

    hasColors(count?: number | ColorEnvironment, env?: ColorEnvironment): boolean {
      return hasColors(count, env);
    }

    _refreshSize(): void {
      const oldCols = this.columns;
      const oldRows = this.rows;
      let size: { columns: number; rows: number };
      try {
        size = call(() => host.windowSize(this.fd));
      } catch (error) {
        this.emit("error", error);
        return;
      }
      const { columns: newCols, rows: newRows } = size;
      if (oldCols !== newCols || oldRows !== newRows) {
        this.columns = newCols;
        this.rows = newRows;
        this.emit("resize");
      }
    }

    // Backwards-compat
    cursorTo(x: number, y?: number | Callback, callback?: Callback): boolean {
      return cursorTo(this, x, y, callback);
    }

    moveCursor(dx: number, dy: number, callback?: Callback): boolean {
      return moveCursor(this, dx, dy, callback);
    }

    clearLine(dir: -1 | 0 | 1, callback?: Callback): boolean {
      return clearLine(this, dir, callback);
    }

    clearScreenDown(callback?: Callback): boolean {
      return clearScreenDown(this, callback);
    }

    getWindowSize(): [number | undefined, number | undefined] {
      return [this.columns, this.rows];
    }
  }

  Object.defineProperty(WriteStream.prototype, "isTTY", {
    value: true,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  enumerable(ReadStream.prototype, ["setRawMode"]);
  enumerable(WriteStream.prototype, [
    "getColorDepth",
    "hasColors",
    "_refreshSize",
    "cursorTo",
    "moveCursor",
    "clearLine",
    "clearScreenDown",
    "getWindowSize",
  ]);

  return {
    isatty,
    ReadStream: constructible(ReadStream) as unknown as ReadStreamConstructor,
    WriteStream: constructible(WriteStream) as unknown as WriteStreamConstructor,
  };
}
