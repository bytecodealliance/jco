import { Buffer } from "node:buffer";
import { Stats } from "../classes.js";
import type { FsCore } from "../core.js";
import { unsupported } from "../operations.js";
import type {
  BufferEncoding,
  FileData,
  FlagOptions,
  Mode,
  ReadOptions,
  ReadResult,
  ReadVResult,
  StatOptions,
  TimeLike,
  WriteOptions,
  WriteResult,
  WriteVResult,
} from "../public-types.js";
import { createFsStreams, type FileStreamOptions } from "../streams.js";
type Numeric = number | bigint;
type StringOrBytes = string | Uint8Array;
type HandleCore = Pick<
  FsCore,
  | "openSync"
  | "appendFileSync"
  | "fchmodSync"
  | "fchownSync"
  | "closeSync"
  | "fdatasyncSync"
  | "readSync"
  | "readFileSync"
  | "readvSync"
  | "fstatSync"
  | "fsyncSync"
  | "ftruncateSync"
  | "futimesSync"
  | "writeSync"
  | "writeFileSync"
  | "writevSync"
>;
export class FileHandle implements AsyncDisposable {
  readonly fd: number;
  readonly #core: HandleCore;
  #closed = false;

  constructor(core: HandleCore, descriptor: number) {
    this.#core = core;
    this.fd = descriptor;
  }

  #open(): void {
    if (this.#closed) {
      const error = new Error("file closed") as Error & { code: string };
      error.code = "EBADF";
      throw error;
    }
  }

  async appendFile(data: FileData, options?: BufferEncoding | FlagOptions | null): Promise<void> {
    this.#open();
    this.#core.appendFileSync(this.fd, data, options);
  }

  async chmod(mode: Mode): Promise<void> {
    this.#open();
    this.#core.fchmodSync(this.fd, mode);
  }

  async chown(uid: number, gid: number): Promise<void> {
    this.#open();
    this.#core.fchownSync(this.fd, uid, gid);
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#core.closeSync(this.fd);
    this.#closed = true;
  }

  createReadStream(options?: FileStreamOptions) {
    this.#open();
    const stream = createFsStreams(this.#core).createReadStream("", { ...options, fd: this.fd });
    if (options?.autoClose !== false) {
      stream.once("close", () => {
        this.#closed = true;
      });
    }
    return stream;
  }

  createWriteStream(options?: FileStreamOptions) {
    this.#open();
    const stream = createFsStreams(this.#core).createWriteStream("", { ...options, fd: this.fd });
    if (options?.autoClose !== false) {
      stream.once("close", () => {
        this.#closed = true;
      });
    }
    return stream;
  }

  async datasync(): Promise<void> {
    this.#open();
    this.#core.fdatasyncSync(this.fd);
  }

  pull(..._args: unknown[]): never {
    return unsupported(
      "filehandle.pull",
      "iterable stream transforms require Node stream resources",
    );
  }

  pullSync(..._args: unknown[]): never {
    return unsupported(
      "filehandle.pullSync",
      "iterable stream transforms require Node stream resources",
    );
  }

  async read<T extends ArrayBufferView>(buffer: T, options?: ReadOptions): Promise<ReadResult<T>>;
  async read<T extends ArrayBufferView>(
    buffer: T,
    offset?: number,
    length?: number,
    position?: number | bigint | null,
  ): Promise<ReadResult<T>>;
  async read<T extends ArrayBufferView>(
    buffer: T,
    offsetOrOptions: number | ReadOptions = 0,
    length?: number,
    readPosition?: number | bigint | null,
  ): Promise<ReadResult<T>> {
    this.#open();
    const options =
      typeof offsetOrOptions === "object"
        ? offsetOrOptions
        : { offset: offsetOrOptions, length, position: readPosition };
    const bytesRead = this.#core.readSync(this.fd, buffer, options);
    return { bytesRead, buffer };
  }

  readableWebStream(..._args: unknown[]): never {
    return unsupported(
      "filehandle.readableWebStream",
      "Web streams require a resource-oriented host boundary",
    );
  }

  async readFile(options?: BufferEncoding | FlagOptions | null): Promise<StringOrBytes> {
    this.#open();
    return this.#core.readFileSync(this.fd, options);
  }

  readLines(..._args: unknown[]): never {
    return unsupported(
      "filehandle.readLines",
      "Node readline streams are not available in the component runtime",
    );
  }

  async readv<T extends readonly ArrayBufferView[]>(
    buffers: T,
    readPosition?: number,
  ): Promise<ReadVResult<T>> {
    this.#open();
    return { bytesRead: this.#core.readvSync(this.fd, buffers, readPosition), buffers };
  }

  async stat(options?: StatOptions): Promise<Stats<Numeric>> {
    this.#open();
    return this.#core.fstatSync(this.fd, options);
  }

  async sync(): Promise<void> {
    this.#open();
    this.#core.fsyncSync(this.fd);
  }

  async truncate(length = 0): Promise<void> {
    this.#open();
    this.#core.ftruncateSync(this.fd, length);
  }

  async utimes(atime: TimeLike, mtime: TimeLike): Promise<void> {
    this.#open();
    this.#core.futimesSync(this.fd, atime, mtime);
  }

  async write<T extends ArrayBufferView>(
    buffer: T,
    options?: WriteOptions,
  ): Promise<WriteResult<T>>;
  async write<T extends ArrayBufferView>(
    buffer: T,
    offset?: number,
    length?: number,
    position?: number | null,
  ): Promise<WriteResult<T>>;
  async write(
    data: string,
    position?: number | null,
    encoding?: BufferEncoding,
  ): Promise<WriteResult<Uint8Array>>;
  async write<T extends ArrayBufferView>(
    value: T | string,
    offsetOrPosition: number | WriteOptions | null = 0,
    lengthOrEncoding?: number | BufferEncoding,
    writePosition?: number | null,
  ): Promise<WriteResult<T | Uint8Array>> {
    this.#open();
    if (typeof value === "string") {
      const buffer = Buffer.from(
        value,
        typeof lengthOrEncoding === "string" ? lengthOrEncoding : "utf8",
      );
      const bytesWritten = this.#core.writeSync(
        this.fd,
        buffer,
        0,
        buffer.byteLength,
        typeof offsetOrPosition === "number" ? offsetOrPosition : null,
      );
      return { bytesWritten, buffer };
    }
    const options =
      typeof offsetOrPosition === "object" && offsetOrPosition !== null
        ? offsetOrPosition
        : {
            offset: typeof offsetOrPosition === "number" ? offsetOrPosition : 0,
            length: typeof lengthOrEncoding === "number" ? lengthOrEncoding : undefined,
            position: writePosition,
          };
    const bytesWritten = this.#core.writeSync(this.fd, value, options);
    return { bytesWritten, buffer: value };
  }

  async writeFile(data: FileData, options?: BufferEncoding | FlagOptions | null): Promise<void> {
    this.#open();
    this.#core.writeFileSync(this.fd, data, options);
  }

  async writev<T extends readonly ArrayBufferView[]>(
    buffers: T,
    writePosition?: number,
  ): Promise<WriteVResult<T>> {
    this.#open();
    return { bytesWritten: this.#core.writevSync(this.fd, buffers, writePosition), buffers };
  }

  writer(..._args: unknown[]): never {
    return unsupported(
      "filehandle.writer",
      "iterable stream writers require Node stream resources",
    );
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#closed) {
      await this.close();
    }
  }
}
