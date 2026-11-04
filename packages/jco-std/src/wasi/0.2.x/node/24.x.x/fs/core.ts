/** Injectable core. Public named imports use standalone operations instead. */
import { invalidArgType } from "../errors/core.js";
import type { HostImports } from "../internal/wit-types.js";
import { Dir, Dirent, Stats } from "./classes.js";
import { FileHandle } from "./optional/file-handle.js";
import * as operations from "./operations.js";
import type {
  AsyncDisposableTempDir,
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
import type { FsHost } from "./types.js";
export { FileHandle } from "./optional/file-handle.js";
export { toUnixTimestamp, unsupportedFsApi } from "./operations.js";
type Numeric = number | bigint;
type StringOrBytes = string | Uint8Array;
export class FsCore {
  readonly #host: HostImports<FsHost>;
  constructor(host: HostImports<FsHost>) {
    this.#host = host;
  }
  accessSync(value: PathLike, mode = 0): void {
    return operations.accessSync(this.#host, value, mode);
  }
  appendFileSync(
    file: PathLike | number,
    data: FileData,
    options?: BufferEncoding | FlagOptions | null,
  ): void {
    return operations.appendFileSync(this.#host, file, data, options);
  }
  chmodSync(value: PathLike, mode: Mode): void {
    return operations.chmodSync(this.#host, value, mode);
  }
  chownSync(value: PathLike, uid: number, gid: number): void {
    return operations.chownSync(this.#host, value, uid, gid);
  }
  closeSync(descriptor: number): void {
    return operations.closeSync(this.#host, descriptor);
  }
  copyFileSync(source: PathLike, destination: PathLike, mode = 0): void {
    return operations.copyFileSync(this.#host, source, destination, mode);
  }
  cpSync(source: PathLike, destination: PathLike, options?: CopyOptions): void {
    return operations.cpSync(this.#host, source, destination, options);
  }
  existsSync(value: PathLike): boolean {
    return operations.existsSync(this.#host, value);
  }
  fchmodSync(descriptor: number, mode: Mode): void {
    return operations.fchmodSync(this.#host, descriptor, mode);
  }
  fchownSync(descriptor: number, uid: number, gid: number): void {
    return operations.fchownSync(this.#host, descriptor, uid, gid);
  }
  fdatasyncSync(descriptor: number): void {
    return operations.fdatasyncSync(this.#host, descriptor);
  }
  fstatSync(descriptor: number, options?: StatOptions): Stats<Numeric> {
    return operations.fstatSync(this.#host, descriptor, options);
  }
  fsyncSync(descriptor: number): void {
    return operations.fsyncSync(this.#host, descriptor);
  }
  ftruncateSync(descriptor: number, length = 0): void {
    return operations.ftruncateSync(this.#host, descriptor, length);
  }
  futimesSync(descriptor: number, atime: TimeLike, mtime: TimeLike): void {
    return operations.futimesSync(this.#host, descriptor, atime, mtime);
  }
  globSync(
    pattern: string | readonly string[],
    options?: GlobOptions,
  ): Array<string | Dirent<string | Uint8Array>> {
    return operations.globSync(this.#host, pattern, options);
  }
  lchownSync(value: PathLike, uid: number, gid: number): void {
    return operations.lchownSync(this.#host, value, uid, gid);
  }
  linkSync(existingPath: PathLike, newPath: PathLike): void {
    return operations.linkSync(this.#host, existingPath, newPath);
  }
  lstatSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
    return operations.lstatSync(this.#host, value, options);
  }
  lutimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
    return operations.lutimesSync(this.#host, value, atime, mtime);
  }
  mkdirSync(value: PathLike, options?: Mode | MakeDirectoryOptions | null): string | undefined {
    return operations.mkdirSync(this.#host, value, options);
  }
  mkdtempSync(
    prefix: string,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    return operations.mkdtempSync(this.#host, prefix, options);
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
    return operations.openSync(this.#host, value, flags, mode);
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
    return operations.readFileSync(this.#host, file, options);
  }
  readdirSync(
    value: PathLike,
    options?: BufferEncoding | ReaddirOptions | null,
  ): Array<StringOrBytes | Dirent<string | Uint8Array>> {
    return operations.readdirSync(this.#host, value, options);
  }
  readlinkSync(
    value: PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    return operations.readlinkSync(this.#host, value, options);
  }
  realpathSync(
    value: PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    return operations.realpathSync(this.#host, value, options);
  }
  renameSync(oldPath: PathLike, newPath: PathLike): void {
    return operations.renameSync(this.#host, oldPath, newPath);
  }
  rmSync(value: PathLike, options?: RemoveOptions): void {
    return operations.rmSync(this.#host, value, options);
  }
  rmdirSync(value: PathLike, options?: RemoveOptions): void {
    return operations.rmdirSync(this.#host, value, options);
  }
  statSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
    return operations.statSync(this.#host, value, options);
  }
  statfsSync(value: PathLike, options?: { bigint?: boolean }): Record<string, Numeric> {
    return operations.statfsSync(this.#host, value, options);
  }
  symlinkSync(target: PathLike, value: PathLike, type?: "dir" | "file" | "junction" | null): void {
    return operations.symlinkSync(this.#host, target, value, type);
  }
  truncateSync(value: PathLike, length = 0): void {
    return operations.truncateSync(this.#host, value, length);
  }
  unlinkSync(value: PathLike): void {
    return operations.unlinkSync(this.#host, value);
  }
  utimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
    return operations.utimesSync(this.#host, value, atime, mtime);
  }
  writeFileSync(
    file: PathLike | number,
    data: FileData,
    options?: BufferEncoding | FlagOptions | null,
  ): void {
    return operations.writeFileSync(this.#host, file, data, options);
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
    return operations.readSync(
      this.#host,
      descriptor,
      buffer,
      offsetOrOptions,
      length,
      readPosition,
    );
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
    return operations.writeSync(
      this.#host,
      descriptor,
      value,
      offsetOrOptions,
      lengthOrEncoding,
      writePosition,
    );
  }
  readvSync(
    descriptor: number,
    buffers: readonly ArrayBufferView[],
    readPosition?: number,
  ): number {
    return operations.readvSync(this.#host, descriptor, buffers, readPosition);
  }
  writevSync(
    descriptor: number,
    buffers: readonly ArrayBufferView[],
    writePosition?: number,
  ): number {
    return operations.writevSync(this.#host, descriptor, buffers, writePosition);
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
export function createFsCore(host: HostImports<FsHost>): FsCore {
  return new FsCore(host);
}
