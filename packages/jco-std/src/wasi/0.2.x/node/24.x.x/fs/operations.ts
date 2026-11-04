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
import { callHost, decodeErrno } from "../internal/host-error.js";
import type { HostImports } from "../internal/wit-types.js";
import { Dir, Dirent, Stats } from "./classes.js";
import type {
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
  ReaddirOptions,
  RemoveOptions,
  StatOptions,
  TimeLike,
  WriteOptions,
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
  // Component bindings may create the byte array in a different JS realm.
  if (
    !ArrayBuffer.isView(value) ||
    Object.prototype.toString.call(value) !== "[object Uint8Array]"
  ) {
    throw new TypeError("invalid filesystem byte response");
  }
  const buffer = Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
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

export function unsupported(api: string, reason: string): never {
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

function unwrap<T>(operation: () => T | FsResult<T>): T {
  return callHost(operation, (value) => {
    const error = systemError({
      message: value.message,
      code: value.code ?? "UNKNOWN",
      errno: decodeErrno(value.errno),
      syscall: value.syscall,
      path: value.path,
      dest: value.dest,
    });
    error.name = value.name;
    return error;
  });
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

export function accessSync(host: HostImports<FsHost>, value: PathLike, mode = 0): void {
  unwrap(() => host.access(path(value), mode));
}

export function appendFileSync(
  host: HostImports<FsHost>,
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
  unwrap(() => host.appendFile(pathOrFd(file), encodeData(data, encoding), writeFileOptions(opts)));
}

export function chmodSync(host: HostImports<FsHost>, value: PathLike, mode: Mode): void {
  unwrap(() => host.chmod(path(value), hostMode(mode)));
}

export function chownSync(
  host: HostImports<FsHost>,
  value: PathLike,
  uid: number,
  gid: number,
): void {
  unwrap(() => host.chown(path(value), integer(uid, "uid"), integer(gid, "gid")));
}

export function closeSync(host: HostImports<FsHost>, descriptor: number): void {
  unwrap(() => host.close(fd(descriptor)));
}

export function copyFileSync(
  host: HostImports<FsHost>,
  source: PathLike,
  destination: PathLike,
  mode = 0,
): void {
  unwrap(() => host.copyFile(path(source, "src"), path(destination, "dest"), mode));
}

export function cpSync(
  host: HostImports<FsHost>,
  source: PathLike,
  destination: PathLike,
  options?: CopyOptions,
): void {
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
  unwrap(() => host.cp(path(source, "src"), path(destination, "dest"), hostOptions));
}

export function existsSync(host: HostImports<FsHost>, value: PathLike): boolean {
  try {
    return unwrap(() => host.exists(path(value)));
  } catch (error) {
    if (isRecord(error) && error.code === "ERR_JCO_FS_ADAPTER_REQUIRED") {
      throw error;
    }
    return false;
  }
}

export function fchmodSync(host: HostImports<FsHost>, descriptor: number, mode: Mode): void {
  unwrap(() => host.fchmod(fd(descriptor), hostMode(mode)));
}

export function fchownSync(
  host: HostImports<FsHost>,
  descriptor: number,
  uid: number,
  gid: number,
): void {
  unwrap(() => host.fchown(fd(descriptor), integer(uid, "uid"), integer(gid, "gid")));
}

export function fdatasyncSync(host: HostImports<FsHost>, descriptor: number): void {
  unwrap(() => host.fdatasync(fd(descriptor)));
}

export function fstatSync(
  host: HostImports<FsHost>,
  descriptor: number,
  options?: StatOptions,
): Stats<Numeric> {
  const result = stats(unwrap(() => host.fstat(fd(descriptor), statOptions(options))));
  if (!result) {
    throw new TypeError("missing filesystem stats response");
  }
  return result;
}

export function fsyncSync(host: HostImports<FsHost>, descriptor: number): void {
  unwrap(() => host.fsync(fd(descriptor)));
}

export function ftruncateSync(host: HostImports<FsHost>, descriptor: number, length = 0): void {
  unwrap(() => host.ftruncate(fd(descriptor), integer(length, "len")));
}

export function futimesSync(
  host: HostImports<FsHost>,
  descriptor: number,
  atime: TimeLike,
  mtime: TimeLike,
): void {
  unwrap(() => host.futimes(fd(descriptor), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
}

export function globSync(
  host: HostImports<FsHost>,
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
  return unwrap(() =>
    host.glob(typeof pattern === "string" ? [pattern] : [...pattern], hostOptions),
  ).map((entry) => (entry.tag === "dirent" ? Dirent.fromHost(entry.val) : entry.val));
}

export function lchownSync(
  host: HostImports<FsHost>,
  value: PathLike,
  uid: number,
  gid: number,
): void {
  unwrap(() => host.lchown(path(value), integer(uid, "uid"), integer(gid, "gid")));
}

export function linkSync(
  host: HostImports<FsHost>,
  existingPath: PathLike,
  newPath: PathLike,
): void {
  unwrap(() => host.link(path(existingPath, "existingPath"), path(newPath, "newPath")));
}

export function lstatSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: StatOptions,
): Stats<Numeric> | undefined {
  return stats(unwrap(() => host.lstat(path(value), statOptions(options))));
}

export function lutimesSync(
  host: HostImports<FsHost>,
  value: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
): void {
  unwrap(() => host.lutimes(path(value), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
}

export function mkdirSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: Mode | MakeDirectoryOptions | null,
): string | undefined {
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
  return unwrap(() => host.mkdir(path(value), hostOptions));
}

export function mkdtempSync(
  host: HostImports<FsHost>,
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
): StringOrBytes {
  if (typeof prefix !== "string") {
    throw invalidArgType("prefix", "string", prefix);
  }
  const encoding = encodingFrom(options);
  const result = unwrap(() => host.mkdtemp(prefix));
  return encoding === "buffer" ? Buffer.from(result) : result;
}

export function mkdtempDisposableSync(
  host: HostImports<FsHost>,
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding } | null,
): DisposableTempDir {
  const value = mkdtempSync(host, prefix, options);
  if (typeof value !== "string") {
    throw new TypeError("temporary directory path must be a string");
  }
  const remove = () => rmSync(host, value, { recursive: true, force: true });
  return { path: value, remove, [Symbol.dispose]: remove };
}

export function openSync(
  host: HostImports<FsHost>,
  value: PathLike,
  flags: OpenMode = "r",
  mode: Mode = 0o666,
): number {
  return unwrap(() => host.open(path(value), hostOpenMode(flags), hostMode(mode)));
}

export function opendirSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: OpenDirOptions,
): Dir {
  if (typeof value !== "string") {
    throw invalidArgType("path", "string", value);
  }
  const pathname = value;
  const entries = readdirSync(host, pathname, {
    ...options,
    encoding: "utf8",
    withFileTypes: true,
  }) as Dirent[];
  return new Dir(pathname, entries);
}

export function readFileSync(
  host: HostImports<FsHost>,
  file: PathLike | number,
  options?: BufferEncoding | FlagOptions | null,
): StringOrBytes {
  const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
  checkSignal(opts.signal);
  const encoding = encodingFrom(typeof options === "string" ? options : (opts as FlagOptions));
  const result = unwrap(() => host.readFile(pathOrFd(file), readFileOptions(opts)));
  return decodeData(result, encoding);
}

export function readdirSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: BufferEncoding | ReaddirOptions | null,
): Array<StringOrBytes | Dirent<string | Uint8Array>> {
  const opts = typeof options === "string" ? { encoding: options } : optionsRecord(options);
  const encoding = encodingFrom(typeof options === "string" ? options : (opts as ReaddirOptions));
  const hostOptions: FsReaddirOptions = {
    recursive: opts.recursive === true,
    withFileTypes: opts.withFileTypes === true,
  };
  const result = unwrap(() => host.readdir(path(value), hostOptions));
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

export function readlinkSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
): StringOrBytes {
  const encoding = encodingFrom(options);
  const result = unwrap(() => host.readlink(path(value)));
  return encoding === "buffer" ? Buffer.from(result) : result;
}

export function realpathSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
): StringOrBytes {
  const encoding = encodingFrom(options);
  const result = unwrap(() => host.realpath(path(value)));
  return encoding === "buffer" ? Buffer.from(result) : result;
}

export function renameSync(host: HostImports<FsHost>, oldPath: PathLike, newPath: PathLike): void {
  unwrap(() => host.rename(path(oldPath, "oldPath"), path(newPath, "newPath")));
}

export function rmSync(host: HostImports<FsHost>, value: PathLike, options?: RemoveOptions): void {
  unwrap(() => host.rm(path(value), removeOptions(optionsRecord(options))));
}

export function rmdirSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: RemoveOptions,
): void {
  const opts = optionsRecord(options);
  if (opts.recursive) {
    throw deprecatedNodeApi(
      "fs.rmdir(path, { recursive: true })",
      "fs.rm(path, { recursive: true })",
    );
  }
  unwrap(() => host.rmdir(path(value), removeOptions(opts)));
}

export function statSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: StatOptions,
): Stats<Numeric> | undefined {
  return stats(unwrap(() => host.stat(path(value), statOptions(options))));
}

export function statfsSync(
  host: HostImports<FsHost>,
  value: PathLike,
  options?: { bigint?: boolean },
): Record<string, Numeric> {
  const result: FsStatFs = unwrap(() => host.statfs(path(value), options?.bigint === true));
  return Object.fromEntries(Object.entries(result).map(([name, value]) => [name, value.val]));
}

export function symlinkSync(
  host: HostImports<FsHost>,
  target: PathLike,
  value: PathLike,
  type?: "dir" | "file" | "junction" | null,
): void {
  unwrap(() => host.symlink(path(target, "target"), path(value), type ?? undefined));
}

export function truncateSync(host: HostImports<FsHost>, value: PathLike, length = 0): void {
  unwrap(() => host.truncate(path(value), integer(length, "len")));
}

export function unlinkSync(host: HostImports<FsHost>, value: PathLike): void {
  unwrap(() => host.unlink(path(value)));
}

export function utimesSync(
  host: HostImports<FsHost>,
  value: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
): void {
  unwrap(() => host.utimes(path(value), toUnixTimestamp(atime), toUnixTimestamp(mtime)));
}

export function writeFileSync(
  host: HostImports<FsHost>,
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
  unwrap(() => host.writeFile(pathOrFd(file), encodeData(data, encoding), writeFileOptions(opts)));
}

export function readSync(
  host: HostImports<FsHost>,
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
  const result = unwrap(() => host.read(fd(descriptor), count, position(opts.position)));
  target.set(result.data, offset);
  return result.bytesRead;
}

export function writeSync(
  host: HostImports<FsHost>,
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
    return unwrap(() =>
      host.write(
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
  return unwrap(() =>
    host.write(fd(descriptor), source.subarray(offset, offset + count), position(opts.position)),
  );
}

export function readvSync(
  host: HostImports<FsHost>,
  descriptor: number,
  buffers: readonly ArrayBufferView[],
  readPosition?: number,
): number {
  if (!Array.isArray(buffers)) {
    throw invalidArgType("buffers", "Array", buffers);
  }
  const targets = buffers.map((buffer) => bytes(buffer));
  const result = unwrap(() =>
    host.readv(
      fd(descriptor),
      targets.map((buffer) => buffer.byteLength),
      position(readPosition),
    ),
  );
  result.buffers.forEach((buffer, index) => targets[index]?.set(buffer));
  return result.bytesRead;
}

export function writevSync(
  host: HostImports<FsHost>,
  descriptor: number,
  buffers: readonly ArrayBufferView[],
  writePosition?: number,
): number {
  if (!Array.isArray(buffers)) {
    throw invalidArgType("buffers", "Array", buffers);
  }
  return unwrap(() =>
    host.writev(
      fd(descriptor),
      buffers.map((buffer) => bytes(buffer)),
      position(writePosition),
    ),
  );
}
