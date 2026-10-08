import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";
import { invalidArgType, outOfRange } from "../errors/core.js";
import type { FsCore } from "./core.js";
import type { PathLike, OpenMode, Mode } from "./public-types.js";

export interface FileStreamOptions {
  fd?: number;
  flags?: OpenMode;
  mode?: Mode;
  autoClose?: boolean;
  emitClose?: boolean;
  start?: number;
  end?: number;
  highWaterMark?: number;
  encoding?: BufferEncoding;
  signal?: AbortSignal;
  flush?: boolean;
}

export interface FileReadable extends Readable {
  fd: number | null;
  readonly path: PathLike;
  bytesRead: number;
  readonly autoClose: boolean;
  readonly pending: boolean;
  close(done?: () => void): void;
}
export interface FileWritable extends Writable {
  fd: number | null;
  readonly path: PathLike;
  bytesWritten: number;
  readonly autoClose: boolean;
  readonly pending: boolean;
  close(done?: () => void): void;
}
export interface FsStreams {
  ReadStream: new (path: PathLike, options?: FileStreamOptions | BufferEncoding) => FileReadable;
  WriteStream: new (path: PathLike, options?: FileStreamOptions | BufferEncoding) => FileWritable;
  FileReadStream: FsStreams["ReadStream"];
  FileWriteStream: FsStreams["WriteStream"];
  createReadStream(path: PathLike, options?: FileStreamOptions | BufferEncoding): FileReadable;
  createWriteStream(path: PathLike, options?: FileStreamOptions | BufferEncoding): FileWritable;
}

function offset(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw outOfRange(name, ">= 0 && <= 9007199254740991", value);
  }
  return value;
}

/** Incremental guest streams over the filesystem's typed descriptor operations. */
export function createFsStreams(core: FsCore): FsStreams {
  class ReadStream extends Readable {
    fd: number | null;
    readonly path: PathLike;
    bytesRead = 0;
    readonly autoClose: boolean;
    #position: number | undefined;
    readonly #end: number;
    readonly #options: FileStreamOptions;

    constructor(path: PathLike, options: FileStreamOptions | BufferEncoding = {}) {
      const opts = typeof options === "string" ? { encoding: options } : options;
      const start = offset(opts.start, "start");
      const end = offset(opts.end, "end") ?? Infinity;
      if (start !== undefined && end < start) {
        throw outOfRange("start", `<= ${end}`, start);
      }
      super({ highWaterMark: 64 * 1024, ...opts, autoDestroy: opts.autoClose !== false });
      this.path = path;
      this.fd = opts.fd ?? null;
      this.autoClose = opts.autoClose !== false;
      this.#options = opts;
      this.#position = start;
      this.#end = end;
    }

    get pending(): boolean {
      return this.fd === null;
    }

    _construct(done: (error?: Error | null) => void): void {
      try {
        if (this.fd === null) {
          this.fd = core.openSync(this.path, this.#options.flags ?? "r", this.#options.mode);
          this.emit("open", this.fd);
        }
        this.emit("ready");
        done();
      } catch (error) {
        done(error as Error);
      }
    }

    _read(size: number): void {
      try {
        const position = this.#position ?? this.bytesRead;
        const length = Math.min(size, this.#end - position + 1);
        if (length <= 0) {
          this.push(null);
          return;
        }
        const buffer = Buffer.allocUnsafe(length);
        const read = core.readSync(this.fd!, buffer, 0, length, this.#position ?? null);
        if (this.#position !== undefined) {
          this.#position += read;
        }
        this.bytesRead += read;
        this.push(read === 0 ? null : buffer.subarray(0, read));
      } catch (error) {
        this.destroy(error as Error);
      }
    }

    _destroy(error: Error | null, done: (error?: Error | null) => void): void {
      try {
        if (this.autoClose && this.fd !== null) {
          const fd = this.fd;
          this.fd = null;
          core.closeSync(fd);
        }
        done(error);
      } catch (caught) {
        done(error ?? (caught as Error));
      }
    }

    close(done?: () => void): void {
      if (done) {
        this.once("close", done);
      }
      this.destroy();
    }
  }

  class WriteStream extends Writable {
    fd: number | null;
    readonly path: PathLike;
    bytesWritten = 0;
    readonly autoClose: boolean;
    #position: number | undefined;
    readonly #options: FileStreamOptions;

    constructor(path: PathLike, options: FileStreamOptions | BufferEncoding = {}) {
      const opts = typeof options === "string" ? { encoding: options } : options;
      const start = offset(opts.start, "start");
      super({ ...opts, autoDestroy: opts.autoClose !== false, defaultEncoding: opts.encoding });
      this.path = path;
      this.fd = opts.fd ?? null;
      this.autoClose = opts.autoClose !== false;
      this.#options = opts;
      this.#position = start;
      queueMicrotask(() => {
        if (!this.destroyed && !this.closed && !this.writableEnded) {
          try {
            this.#open();
          } catch (error) {
            this.destroy(error as Error);
          }
        }
      });
    }

    get pending(): boolean {
      return this.fd === null;
    }

    #open(): void {
      if (this.fd === null) {
        this.fd = core.openSync(this.path, this.#options.flags ?? "w", this.#options.mode);
        this.emit("open", this.fd);
        this.emit("ready");
      }
    }

    _write(chunk: Buffer, encoding: BufferEncoding, done: (error?: Error | null) => void): void {
      try {
        this.#open();
        const bytes = typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
        let consumed = 0;
        while (consumed < bytes.length) {
          const written = core.writeSync(
            this.fd!,
            bytes,
            consumed,
            bytes.length - consumed,
            this.#position ?? null,
          );
          if (written === 0) {
            throw Object.assign(new Error("write returned zero bytes"), { code: "EIO" });
          }
          consumed += written;
          this.bytesWritten += written;
          if (this.#position !== undefined) {
            this.#position += written;
          }
        }
        done();
      } catch (error) {
        done(error as Error);
      }
    }

    _final(done: (error?: Error | null) => void): void {
      try {
        this.#open();
        if (this.#options.flush && this.fd !== null) {
          core.fsyncSync(this.fd);
        }
        done();
      } catch (error) {
        done(error as Error);
      }
    }

    _destroy(error: Error | null, done: (error?: Error | null) => void): void {
      try {
        if (this.autoClose && this.fd !== null) {
          const fd = this.fd;
          this.fd = null;
          core.closeSync(fd);
        }
        done(error);
      } catch (caught) {
        done(error ?? (caught as Error));
      }
    }

    close(done?: () => void): void {
      if (done) {
        this.once("close", done);
      }
      this.destroy();
    }
  }

  return {
    ReadStream,
    WriteStream,
    FileReadStream: ReadStream,
    FileWriteStream: WriteStream,
    createReadStream: (path: PathLike, options?: FileStreamOptions | BufferEncoding) =>
      new ReadStream(path, options),
    createWriteStream: (path: PathLike, options?: FileStreamOptions | BufferEncoding) =>
      new WriteStream(path, options),
  };
}
