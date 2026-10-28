/** Standalone entry points: no facade, handles or stream initialization. */
import * as host from "jco:node/fs@0.1.0";
import { deprecatedNodeApi } from "../errors/core.js";
import { Dir, Dirent, Stats } from "./classes.js";
import * as operations from "./operations.js";
import type {
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
type Numeric = number | bigint;
type StringOrBytes = string | Uint8Array;
export function accessSync(value: PathLike, mode = 0): void {
  return operations.accessSync(host, value, mode);
}
export function appendFileSync(
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
): void {
  return operations.appendFileSync(host, file, data, options);
}
export function chmodSync(value: PathLike, mode: Mode): void {
  return operations.chmodSync(host, value, mode);
}
export function chownSync(value: PathLike, uid: number, gid: number): void {
  return operations.chownSync(host, value, uid, gid);
}
export function closeSync(descriptor: number): void {
  return operations.closeSync(host, descriptor);
}
export function copyFileSync(source: PathLike, destination: PathLike, mode = 0): void {
  return operations.copyFileSync(host, source, destination, mode);
}
export function cpSync(source: PathLike, destination: PathLike, options?: CopyOptions): void {
  return operations.cpSync(host, source, destination, options);
}
export function existsSync(value: PathLike): boolean {
  return operations.existsSync(host, value);
}
export function fchmodSync(descriptor: number, mode: Mode): void {
  return operations.fchmodSync(host, descriptor, mode);
}
export function fchownSync(descriptor: number, uid: number, gid: number): void {
  return operations.fchownSync(host, descriptor, uid, gid);
}
export function fdatasyncSync(descriptor: number): void {
  return operations.fdatasyncSync(host, descriptor);
}
export function fstatSync(descriptor: number, options?: StatOptions): Stats<Numeric> {
  return operations.fstatSync(host, descriptor, options);
}
export function fsyncSync(descriptor: number): void {
  return operations.fsyncSync(host, descriptor);
}
export function ftruncateSync(descriptor: number, length = 0): void {
  return operations.ftruncateSync(host, descriptor, length);
}
export function futimesSync(descriptor: number, atime: TimeLike, mtime: TimeLike): void {
  return operations.futimesSync(host, descriptor, atime, mtime);
}
export function globSync(
  pattern: string | readonly string[],
  options?: GlobOptions,
): Array<string | Dirent<string | Uint8Array>> {
  return operations.globSync(host, pattern, options);
}
export function lchownSync(value: PathLike, uid: number, gid: number): void {
  return operations.lchownSync(host, value, uid, gid);
}
export function linkSync(existingPath: PathLike, newPath: PathLike): void {
  return operations.linkSync(host, existingPath, newPath);
}
export function lstatSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
  return operations.lstatSync(host, value, options);
}
export function lutimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
  return operations.lutimesSync(host, value, atime, mtime);
}
export function mkdirSync(
  value: PathLike,
  options?: Mode | MakeDirectoryOptions | null,
): string | undefined {
  return operations.mkdirSync(host, value, options);
}
export function mkdtempSync(
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
): StringOrBytes {
  return operations.mkdtempSync(host, prefix, options);
}
export function mkdtempDisposableSync(
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding } | null,
): DisposableTempDir {
  return operations.mkdtempDisposableSync(host, prefix, options);
}
export function openSync(value: PathLike, flags: OpenMode = "r", mode: Mode = 0o666): number {
  return operations.openSync(host, value, flags, mode);
}
export function opendirSync(value: PathLike, options?: OpenDirOptions): Dir {
  return operations.opendirSync(host, value, options);
}
export function readFileSync(
  file: PathLike | number,
  options?: BufferEncoding | FlagOptions | null,
): StringOrBytes {
  return operations.readFileSync(host, file, options);
}
export function readdirSync(
  value: PathLike,
  options?: BufferEncoding | ReaddirOptions | null,
): Array<StringOrBytes | Dirent<string | Uint8Array>> {
  return operations.readdirSync(host, value, options);
}
export function readlinkSync(
  value: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
): StringOrBytes {
  return operations.readlinkSync(host, value, options);
}
// Only decorates a fresh function; no host calls or shared mutations.
export const realpathSync = /* @__PURE__ */ Object.assign(
  function realpathSync(
    value: PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
  ): StringOrBytes {
    return operations.realpathSync(host, value, options);
  },
  {
    native: function realpathSync(
      value: PathLike,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ): StringOrBytes {
      return operations.realpathSync(host, value, options);
    },
  },
);
export function renameSync(oldPath: PathLike, newPath: PathLike): void {
  return operations.renameSync(host, oldPath, newPath);
}
export function rmSync(value: PathLike, options?: RemoveOptions): void {
  return operations.rmSync(host, value, options);
}
export function rmdirSync(value: PathLike, options?: RemoveOptions): void {
  return operations.rmdirSync(host, value, options);
}
export function statSync(value: PathLike, options?: StatOptions): Stats<Numeric> | undefined {
  return operations.statSync(host, value, options);
}
export function statfsSync(
  value: PathLike,
  options?: { bigint?: boolean },
): Record<string, Numeric> {
  return operations.statfsSync(host, value, options);
}
export function symlinkSync(
  target: PathLike,
  value: PathLike,
  type?: "dir" | "file" | "junction" | null,
): void {
  return operations.symlinkSync(host, target, value, type);
}
export function truncateSync(value: PathLike, length = 0): void {
  return operations.truncateSync(host, value, length);
}
export function unlinkSync(value: PathLike): void {
  return operations.unlinkSync(host, value);
}
export function utimesSync(value: PathLike, atime: TimeLike, mtime: TimeLike): void {
  return operations.utimesSync(host, value, atime, mtime);
}
export function writeFileSync(
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
): void {
  return operations.writeFileSync(host, file, data, options);
}
export function readSync(
  descriptor: number,
  buffer: ArrayBufferView,
  options?: ReadOptions,
): number;
export function readSync(
  descriptor: number,
  buffer: ArrayBufferView,
  offset?: number,
  length?: number,
  readPosition?: number | bigint | null,
): number;
export function readSync(
  descriptor: number,
  buffer: ArrayBufferView,
  offsetOrOptions: number | ReadOptions = 0,
  length?: number,
  readPosition?: number | bigint | null,
): number {
  return operations.readSync(host, descriptor, buffer, offsetOrOptions, length, readPosition);
}
export function writeSync(
  descriptor: number,
  buffer: ArrayBufferView,
  options?: WriteOptions,
): number;
export function writeSync(
  descriptor: number,
  buffer: ArrayBufferView,
  offset?: number,
  length?: number,
  writePosition?: number | null,
): number;
export function writeSync(
  descriptor: number,
  value: string,
  writePosition?: number | null,
  encoding?: BufferEncoding,
): number;
export function writeSync(
  descriptor: number,
  value: ArrayBufferView | string,
  offsetOrOptions: number | WriteOptions | null = 0,
  lengthOrEncoding?: number | BufferEncoding,
  writePosition?: number | null,
): number {
  return operations.writeSync(
    host,
    descriptor,
    value,
    offsetOrOptions,
    lengthOrEncoding,
    writePosition,
  );
}
export function readvSync(
  descriptor: number,
  buffers: readonly ArrayBufferView[],
  readPosition?: number,
): number {
  return operations.readvSync(host, descriptor, buffers, readPosition);
}
export function writevSync(
  descriptor: number,
  buffers: readonly ArrayBufferView[],
  writePosition?: number,
): number {
  return operations.writevSync(host, descriptor, buffers, writePosition);
}
export { toUnixTimestamp as _toUnixTimestamp } from "./operations.js";
export function lchmodSync(..._args: unknown[]): never {
  throw deprecatedNodeApi("fs.lchmodSync");
}
