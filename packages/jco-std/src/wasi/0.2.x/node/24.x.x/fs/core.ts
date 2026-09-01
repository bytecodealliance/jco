/**
 * Shared Node.js filesystem core.
 *
 * Public validation and overload behavior follows nodejs/node v24.19.0,
 * commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/fs.js,
 * lib/internal/fs/promises.js, and lib/internal/fs/utils.js (MIT license).
 * Local changes route operations through typed jco:node/fs functions,
 * reconstruct public value objects guest-side, and reject resource/event APIs
 * explicitly.
 */
import { Buffer } from "node:buffer";

import {
  AbortError,
  deprecatedNodeApi,
  invalidArgType,
  invalidArgValue,
  outOfRange,
  systemError,
  unsupportedNodeApi,
} from "../errors/core.js";

import { Dir, Dirent, Stats } from "./classes.js";
import type {
  AsyncDisposableTempDir,
  BinaryData,
  BufferEncoding,
  CopyOptions,
  DisposableTempDir,
  FileData,
  FlagOptions,
  GlobOptions,
  MakeDirectoryOptions,
  Mode,
  OpenDirOptions,
  OpenMode,
  PathLike,
  ReadOptions,
  ReadResult,
  ReadVResult,
  ReaddirOptions,
  RemoveOptions,
  StatOptions,
  TimeLike,
  WriteOptions,
  WriteResult,
  WriteVResult,
} from "./public-types.js";
import type {
  FsCopyOptions,
  FsGlobExclude,
  FsGlobOptions,
  FsHost,
  FsMkdirOptions,
  FsMode,
  FsOpenMode,
  FsPath,
  FsPathOrDescriptor,
  FsReadFileOptions,
  FsReaddirOptions,
  FsRemoveOptions,
  FsResult,
  FsStatFs,
  FsStatOptions,
  FsStats,
  FsWriteFileOptions,
} from "./types.js";

type Numeric = number | bigint;
type StringOrBytes = string | Uint8Array;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function path(value: PathLike, name = "path"): FsPath {
  if (typeof value === "string") {
    return { tag: "text", val: value };
  }
  if (value instanceof Uint8Array) {
    return { tag: "bytes", val: value };
  }
  if (value instanceof URL) {
    if (value.protocol !== "file:") {
      throw invalidArgValue(name, value, "must use the file: scheme");
    }
    return { tag: "file-url", val: value.href };
  }
  throw invalidArgType(name, ["string", "Buffer", "URL"], value);
}

function pathOrFd(value: PathLike | number, name = "path"): FsPathOrDescriptor {
  if (typeof value === "number") {
    return { tag: "descriptor", val: fd(value) };
  }
  return { tag: "path", val: path(value, name) };
}

function fd(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw outOfRange("fd", ">= 0 and <= 2147483647", value);
  }
  return value;
}

function position(value: number | bigint | null | undefined): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    (typeof value !== "number" && typeof value !== "bigint") ||
    value < 0 ||
    (typeof value === "number" && !Number.isInteger(value))
  ) {
    throw outOfRange("position", ">= 0", value);
  }
  return BigInt(value);
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw outOfRange(name, `>= ${minimum}`, value);
  }
  return value as number;
}

function viewBytes(value: ArrayBufferView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function bytes(value: BinaryData, name = "buffer"): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return viewBytes(value);
  }
  throw invalidArgType(name, ["Buffer", "TypedArray", "DataView"], value);
}

function encodingFrom(
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" | null } | null,
): BufferEncoding | "buffer" | null {
  if (typeof options === "string") {
    return options;
  }
  if (options === undefined || options === null) {
    return null;
  }
  if (typeof options !== "object") {
    throw invalidArgType("options", ["string", "Object"], options);
  }
  return options.encoding ?? null;
}

function decodeData(value: unknown, encoding: BufferEncoding | "buffer" | null): StringOrBytes {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("invalid filesystem byte response");
  }
  const buffer = Buffer.from(value);
  return encoding && encoding !== "buffer" ? buffer.toString(encoding) : buffer;
}

function encodeData(value: FileData, encoding: BufferEncoding = "utf8"): Uint8Array {
  if (typeof value === "string") {
    return Buffer.from(value, encoding);
  }
  return bytes(value, "data");
}

function optionsRecord(value: unknown, name = "options"): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object") {
    throw invalidArgType(name, "Object", value);
  }
  return { ...value };
}

function checkSignal(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!(value instanceof AbortSignal)) {
    throw invalidArgType("options.signal", "AbortSignal", value);
  }
  if (value.aborted) {
    throw new AbortError(undefined, { cause: value.reason });
  }
}

function unsupported(api: string, reason: string): never {
  throw unsupportedNodeApi(api, reason);
}

function stats(value: FsStats | undefined): Stats<Numeric> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return new Stats(value);
}

function hostMode(value: Mode): FsMode {
  return typeof value === "number"
    ? { tag: "number", val: integer(value, "mode") }
    : { tag: "symbolic", val: value };
}

function hostOpenMode(value: OpenMode): FsOpenMode {
  return typeof value === "number"
    ? { tag: "number", val: value }
    : { tag: "symbolic", val: value };
}

function statOptions(options: StatOptions | undefined): FsStatOptions {
  const value = optionsRecord(options);
  return {
    bigint: value.bigint === true,
    throwIfNoEntry: value.throwIfNoEntry !== false,
  };
}

function readFileOptions(options: Record<string, unknown>): FsReadFileOptions {
  return {
    flag: typeof options.flag === "string" ? options.flag : undefined,
  };
}

function writeFileOptions(options: Record<string, unknown>): FsWriteFileOptions {
  return {
    flag: typeof options.flag === "string" ? options.flag : undefined,
    mode:
      typeof options.mode === "string" || typeof options.mode === "number"
        ? hostMode(options.mode)
        : undefined,
    flush: options.flush === true,
  };
}

function removeOptions(options: Record<string, unknown>): FsRemoveOptions {
  return {
    force: options.force === true,
    maxRetries: integer(options.maxRetries ?? 0, "options.maxRetries"),
    recursive: options.recursive === true,
    retryDelay: integer(options.retryDelay ?? 100, "options.retryDelay"),
  };
}

function unwrap<T>(result: FsResult<T>): T {
  if (result.tag === "ok") {
    return result.val;
  }
  const value = result.val;
  const error = systemError({
    message: value.message,
    code: value.code ?? "UNKNOWN",
    errno:
      value.errno?.tag === "number"
        ? Number(value.errno.val)
        : value.errno?.tag === "symbolic"
          ? value.errno.val
          : undefined,
    syscall: value.syscall,
    path: value.path,
    dest: value.dest,
  });
  error.name = value.name;
  throw error;
}

export class FileHandle implements AsyncDisposable {
  readonly fd: number;
  readonly #core: FsCore;
  #closed = false;

  constructor(core: FsCore, descriptor: number) {
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

  createReadStream(..._args: unknown[]): never {
    return unsupported(
      "filehandle.createReadStream",
      "Node streams cannot cross the filesystem host boundary",
    );
  }

  createWriteStream(..._args: unknown[]): never {
    return unsupported(
      "filehandle.createWriteStream",
      "Node streams cannot cross the filesystem host boundary",
    );
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

export class FsCore {
  readonly #host: FsHost;

  constructor(host: FsHost) {
    this.#host = host;
  }

  accessSync(value: PathLike, mode = 0): void {
    unwrap(this.#host.access(path(value), mode));
  }

  appendFileSync(
    file: PathLike | number,
    data: FileData,
    options?: BufferEncoding | FlagOptions | null,
  ): void {
    const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
    checkSignal(opts.signal);
    const encoding =
      typeof opts.encoding === "string" && opts.encoding !== "buffer"
        ? (opts.encoding as BufferEncoding)
        : "utf8";
    unwrap(
      this.#host.appendFile(pathOrFd(file), encodeData(data, encoding), writeFileOptions(opts)),
    );
  }

  chmodSync(value: PathLike, mode: Mode): void {
    unwrap(this.#host.chmod(path(value), hostMode(mode)));
  }

  chownSync(value: PathLike, uid: number, gid: number): void {
    unwrap(this.#host.chown(path(value), integer(uid, "uid"), integer(gid, "gid")));
  }

  closeSync(descriptor: number): void {
    unwrap(this.#host.close(fd(descriptor)));
  }

  copyFileSync(source: PathLike, destination: PathLike, mode = 0): void {
    unwrap(this.#host.copyFile(path(source, "src"), path(destination, "dest"), mode));
  }

  cpSync(source: PathLike, destination: PathLike, options?: CopyOptions): void {
    const opts = optionsRecord(options);
    if (typeof opts.filter === "function") {
      unsupported("fs.cp filter", "functions cannot cross the filesystem host boundary");
    }
    const hostOptions: FsCopyOptions = {
      dereference: opts.dereference === true,
      errorOnExist: opts.errorOnExist === true,
      force: opts.force !== false,
      preserveTimestamps: opts.preserveTimestamps === true,
      recursive: opts.recursive === true,
      verbatimSymlinks: opts.verbatimSymlinks === true,
    };
    unwrap(this.#host.cp(path(source, "src"), path(destination, "dest"), hostOptions));
  }

  existsSync(value: PathLike): boolean {
    try {
      return unwrap(this.#host.exists(path(value)));
    } catch (error) {
      if (isRecord(error) && error.code === "ERR_JCO_FS_ADAPTER_REQUIRED") {
        throw error;
      }
      return false;
    }
  }

  fchmodSync(descriptor: number, mode: Mode): void {
    unwrap(this.#host.fchmod(fd(descriptor), hostMode(mode)));
  }

  fchownSync(descriptor: number, uid: number, gid: number): void {
    unwrap(this.#host.fchown(fd(descriptor), integer(uid, "uid"), integer(gid, "gid")));
  }

  fdatasyncSync(descriptor: number): void {
    unwrap(this.#host.fdatasync(fd(descriptor)));
  }

  fstatSync(descriptor: number, options?: StatOptions): Stats<Numeric> {
    const result = stats(unwrap(this.#host.fstat(fd(descriptor), statOptions(options))));
    if (!result) {
      throw new TypeError("missing filesystem stats response");
    }
    return result;
  }

  fsyncSync(descriptor: number): void {
    unwrap(this.#host.fsync(fd(descriptor)));
  }

  ftruncateSync(descriptor: number, length = 0): void {
    unwrap(this.#host.ftruncate(fd(descriptor), integer(length, "len")));
  }

  futimesSync(descriptor: number, atime: TimeLike, mtime: TimeLike): void {
    unwrap(this.#host.futimes(fd(descriptor), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
  }

  globSync(
    pattern: string | readonly string[],
    options?: GlobOptions,
  ): Array<string | Dirent<string | Uint8Array>> {
    if (typeof pattern !== "string" && !Array.isArray(pattern)) {
      throw invalidArgType("pattern", ["string", "Array"], pattern);
    }
    const opts = optionsRecord(options);
    if (typeof opts.exclude === "function") {
      unsupported("fs.glob exclude", "functions cannot cross the filesystem host boundary");
    }
    let exclude: FsGlobExclude | undefined;
    if (typeof opts.exclude === "string") {
      exclude = { tag: "pattern", val: opts.exclude };
    } else if (Array.isArray(opts.exclude)) {
      exclude = { tag: "patterns", val: opts.exclude.map(String) };
    }
    const hostOptions: FsGlobOptions = {
      cwd: opts.cwd === undefined ? undefined : path(opts.cwd as PathLike, "options.cwd"),
      exclude,
      withFileTypes: opts.withFileTypes === true,
    };
    return unwrap(
      this.#host.glob(typeof pattern === "string" ? [pattern] : [...pattern], hostOptions),
    ).map((entry) => (entry.tag === "dirent" ? Dirent.fromHost(entry.val) : entry.val));
  }

  lchownSync(value: PathLike, uid: number, gid: number): void {
    unwrap(this.#host.lchown(path(value), integer(uid, "uid"), integer(gid, "gid")));
  }

  linkSync(existingPath: PathLike, newPath: PathLike): void {
    unwrap(this.#host.link(path(existingPath, "existingPath"), path(newPath, "newPath")));
  }

  lstatSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
    return stats(unwrap(this.#host.lstat(path(value), statOptions(options))));
  }

  lutimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
    unwrap(this.#host.lutimes(path(value), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
  }

  mkdirSync(value: PathLike, options?: Mode | MakeDirectoryOptions | null): string | undefined {
    const opts =
      typeof options === "string" || typeof options === "number"
        ? { mode: options }
        : optionsRecord(options);
    const hostOptions: FsMkdirOptions = {
      recursive: opts.recursive === true,
      mode:
        typeof opts.mode === "string" || typeof opts.mode === "number"
          ? hostMode(opts.mode)
          : undefined,
    };
    return unwrap(this.#host.mkdir(path(value), hostOptions));
  }

  mkdtempSync(
    prefix: string,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    if (typeof prefix !== "string") {
      throw invalidArgType("prefix", "string", prefix);
    }
    const encoding = encodingFrom(options);
    const result = unwrap(this.#host.mkdtemp(prefix));
    return encoding === "buffer" ? Buffer.from(result) : result;
  }

  mkdtempDisposableSync(
    prefix: string,
    options?: BufferEncoding | { encoding?: BufferEncoding } | null,
  ): DisposableTempDir {
    const value = this.mkdtempSync(prefix, options);
    if (typeof value !== "string") {
      throw new TypeError("temporary directory path must be a string");
    }
    const remove = () => this.rmSync(value, { recursive: true, force: true });
    return { path: value, remove, [Symbol.dispose]: remove };
  }

  openSync(value: PathLike, flags: OpenMode = "r", mode: Mode = 0o666): number {
    return unwrap(this.#host.open(path(value), hostOpenMode(flags), hostMode(mode)));
  }

  opendirSync(value: PathLike, options?: OpenDirOptions): Dir {
    if (typeof value !== "string") {
      throw invalidArgType("path", "string", value);
    }
    const pathname = value;
    const entries = this.readdirSync(pathname, {
      ...options,
      encoding: "utf8",
      withFileTypes: true,
    }) as Dirent[];
    return new Dir(pathname, entries);
  }

  readFileSync(
    file: PathLike | number,
    options?: BufferEncoding | FlagOptions | null,
  ): StringOrBytes {
    const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
    checkSignal(opts.signal);
    const encoding = encodingFrom(typeof options === "string" ? options : (opts as FlagOptions));
    const result = unwrap(this.#host.readFile(pathOrFd(file), readFileOptions(opts)));
    return decodeData(result, encoding);
  }

  readdirSync(
    value: PathLike,
    options?: BufferEncoding | ReaddirOptions | null,
  ): Array<StringOrBytes | Dirent<string | Uint8Array>> {
    const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
    const encoding = encodingFrom(typeof options === "string" ? options : (opts as ReaddirOptions));
    const hostOptions: FsReaddirOptions = {
      recursive: opts.recursive === true,
      withFileTypes: opts.withFileTypes === true,
    };
    const result = unwrap(this.#host.readdir(path(value), hostOptions));
    return result.map((entry) => {
      if (entry.tag === "dirent") {
        const dirent = Dirent.fromHost(entry.val);
        return encoding === "buffer"
          ? new Dirent(
              Buffer.from(String(dirent.name)),
              dirent.parentPath,
              dirent.isFile()
                ? "file"
                : dirent.isDirectory()
                  ? "directory"
                  : dirent.isSymbolicLink()
                    ? "symlink"
                    : "unknown",
            )
          : dirent;
      }
      const name = entry.val;
      return encoding === "buffer" ? Buffer.from(name) : name;
    });
  }

  readlinkSync(
    value: PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    const encoding = encodingFrom(options);
    const result = unwrap(this.#host.readlink(path(value)));
    return encoding === "buffer" ? Buffer.from(result) : result;
  }

  realpathSync(
    value: PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    const encoding = encodingFrom(options);
    const result = unwrap(this.#host.realpath(path(value)));
    return encoding === "buffer" ? Buffer.from(result) : result;
  }

  renameSync(oldPath: PathLike, newPath: PathLike): void {
    unwrap(this.#host.rename(path(oldPath, "oldPath"), path(newPath, "newPath")));
  }

  rmSync(value: PathLike, options?: RemoveOptions): void {
    unwrap(this.#host.rm(path(value), removeOptions(optionsRecord(options))));
  }

  rmdirSync(value: PathLike, options?: RemoveOptions): void {
    const opts = optionsRecord(options);
    if (opts.recursive) {
      throw deprecatedNodeApi(
        "fs.rmdir(path, { recursive: true })",
        "fs.rm(path, { recursive: true })",
      );
    }
    unwrap(this.#host.rmdir(path(value), removeOptions(opts)));
  }

  statSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
    return stats(unwrap(this.#host.stat(path(value), statOptions(options))));
  }

  statfsSync(value: PathLike, options?: { bigint?: boolean }): Record<string, Numeric> {
    const result: FsStatFs = unwrap(this.#host.statfs(path(value), options?.bigint === true));
    return Object.fromEntries(Object.entries(result).map(([name, value]) => [name, value.val]));
  }

  symlinkSync(target: PathLike, value: PathLike, type?: "dir" | "file" | "junction" | null): void {
    unwrap(this.#host.symlink(path(target, "target"), path(value), type ?? undefined));
  }

  truncateSync(value: PathLike, length = 0): void {
    unwrap(this.#host.truncate(path(value), integer(length, "len")));
  }

  unlinkSync(value: PathLike): void {
    unwrap(this.#host.unlink(path(value)));
  }

  utimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
    unwrap(this.#host.utimes(path(value), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
  }

  writeFileSync(
    file: PathLike | number,
    data: FileData,
    options?: BufferEncoding | FlagOptions | null,
  ): void {
    const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
    checkSignal(opts.signal);
    const encoding =
      typeof opts.encoding === "string" && opts.encoding !== "buffer"
        ? (opts.encoding as BufferEncoding)
        : "utf8";
    unwrap(
      this.#host.writeFile(pathOrFd(file), encodeData(data, encoding), writeFileOptions(opts)),
    );
  }

  readSync(descriptor: number, buffer: ArrayBufferView, options?: ReadOptions): number;
  readSync(
    descriptor: number,
    buffer: ArrayBufferView,
    offset?: number,
    length?: number,
    readPosition?: number | bigint | null,
  ): number;
  readSync(
    descriptor: number,
    buffer: ArrayBufferView,
    offsetOrOptions: number | ReadOptions = 0,
    length?: number,
    readPosition?: number | bigint | null,
  ): number {
    const target = bytes(buffer);
    const opts =
      typeof offsetOrOptions === "object"
        ? offsetOrOptions
        : { offset: offsetOrOptions, length, position: readPosition };
    const offset = integer(opts.offset ?? 0, "offset");
    const count = integer(opts.length ?? target.byteLength - offset, "length");
    if (offset + count > target.byteLength) {
      throw outOfRange("length", `<= ${target.byteLength - offset}`, count);
    }
    const result = unwrap(this.#host.read(fd(descriptor), count, position(opts.position)));
    target.set(result.data, offset);
    return result.bytesRead;
  }

  writeSync(descriptor: number, buffer: ArrayBufferView, options?: WriteOptions): number;
  writeSync(
    descriptor: number,
    buffer: ArrayBufferView,
    offset?: number,
    length?: number,
    writePosition?: number | null,
  ): number;
  writeSync(
    descriptor: number,
    value: string,
    writePosition?: number | null,
    encoding?: BufferEncoding,
  ): number;
  writeSync(
    descriptor: number,
    value: ArrayBufferView | string,
    offsetOrOptions: number | WriteOptions | null = 0,
    lengthOrEncoding?: number | BufferEncoding,
    writePosition?: number | null,
  ): number {
    if (typeof value === "string") {
      const data = Buffer.from(
        value,
        typeof lengthOrEncoding === "string" ? lengthOrEncoding : "utf8",
      );
      return unwrap(
        this.#host.write(
          fd(descriptor),
          data,
          position(typeof offsetOrOptions === "number" ? offsetOrOptions : null),
        ),
      );
    }
    const source = bytes(value);
    const opts =
      typeof offsetOrOptions === "object" && offsetOrOptions !== null
        ? offsetOrOptions
        : {
            offset: typeof offsetOrOptions === "number" ? offsetOrOptions : 0,
            length: typeof lengthOrEncoding === "number" ? lengthOrEncoding : undefined,
            position: writePosition,
          };
    const offset = integer(opts.offset ?? 0, "offset");
    const count = integer(opts.length ?? source.byteLength - offset, "length");
    if (offset + count > source.byteLength) {
      throw outOfRange("length", `<= ${source.byteLength - offset}`, count);
    }
    return unwrap(
      this.#host.write(
        fd(descriptor),
        source.subarray(offset, offset + count),
        position(opts.position),
      ),
    );
  }

  readvSync(
    descriptor: number,
    buffers: readonly ArrayBufferView[],
    readPosition?: number,
  ): number {
    if (!Array.isArray(buffers)) {
      throw invalidArgType("buffers", "Array", buffers);
    }
    const targets = buffers.map((buffer) => bytes(buffer));
    const result = unwrap(
      this.#host.readv(
        fd(descriptor),
        targets.map((buffer) => buffer.byteLength),
        position(readPosition),
      ),
    );
    result.buffers.forEach((buffer, index) => targets[index]?.set(buffer));
    return result.bytesRead;
  }

  writevSync(
    descriptor: number,
    buffers: readonly ArrayBufferView[],
    writePosition?: number,
  ): number {
    if (!Array.isArray(buffers)) {
      throw invalidArgType("buffers", "Array", buffers);
    }
    return unwrap(
      this.#host.writev(
        fd(descriptor),
        buffers.map((buffer) => bytes(buffer)),
        position(writePosition),
      ),
    );
  }

  async open(value: PathLike, flags: OpenMode = "r", mode: Mode = 0o666): Promise<FileHandle> {
    return new FileHandle(this, this.openSync(value, flags, mode));
  }

  async mkdtempDisposable(
    prefix: string,
    options?: BufferEncoding | { encoding?: BufferEncoding } | null,
  ): Promise<AsyncDisposableTempDir> {
    const disposable = this.mkdtempDisposableSync(prefix, options);
    const remove = async () => disposable.remove();
    return { path: disposable.path, remove, [Symbol.asyncDispose]: remove };
  }
}

export function createFsCore(host: FsHost): FsCore {
  return new FsCore(host);
}

export function toUnixTimestamp(value: TimeLike): number {
  if (value instanceof Date) {
    return value.getTime() / 1000;
  }
  if (typeof value === "string" && value.trim() !== "") {
    value = Number(value);
  }
  if (typeof value !== "number") {
    throw invalidArgType("time", ["number", "string", "Date"], value);
  }
  if (Number.isNaN(value) || value < 0) {
    throw invalidArgValue("time", value);
  }
  return value;
}

export function unsupportedFsApi(api: string): never {
  return unsupported(api, "the filesystem WIT interface does not model event or stream resources");
}
