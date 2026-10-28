import { constants } from "./fs/constants.js";
import { FileHandle } from "./fs/optional/file-handle.js";
import * as operations from "./fs/optional/promise-operations.js";
import type {
  BufferEncoding,
  CopyOptions,
  FileData,
  FlagOptions,
  GlobOptions,
  MakeDirectoryOptions,
  Mode,
  OpenDirOptions,
  OpenMode,
  PathLike,
  ReaddirOptions,
  RemoveOptions,
  StatOptions,
  TimeLike,
} from "./fs/public-types.js";
import * as sync from "./fs/sync.js";
export async function access(path: PathLike, mode?: number): Promise<void> {
  return operations.access({ accessSync: sync.accessSync }, path, mode);
}
export async function appendFile(
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
): Promise<void> {
  return operations.appendFile({ appendFileSync: sync.appendFileSync }, file, data, options);
}
export async function chmod(path: PathLike, mode: Mode): Promise<void> {
  return operations.chmod({ chmodSync: sync.chmodSync }, path, mode);
}
export async function chown(path: PathLike, uid: number, gid: number): Promise<void> {
  return operations.chown({ chownSync: sync.chownSync }, path, uid, gid);
}
export async function copyFile(
  source: PathLike,
  destination: PathLike,
  mode?: number,
): Promise<void> {
  return operations.copyFile({ copyFileSync: sync.copyFileSync }, source, destination, mode);
}
export async function cp(
  source: PathLike,
  destination: PathLike,
  options?: CopyOptions,
): Promise<void> {
  return operations.cp({ cpSync: sync.cpSync }, source, destination, options);
}
export async function glob(pattern: string | readonly string[], options?: GlobOptions) {
  return operations.glob({ globSync: sync.globSync }, pattern, options);
}
export async function lchmod(_path: PathLike, _mode: Mode): Promise<never> {
  return operations.lchmod({}, _path, _mode);
}
export async function lchown(path: PathLike, uid: number, gid: number): Promise<void> {
  return operations.lchown({ lchownSync: sync.lchownSync }, path, uid, gid);
}
export async function link(existingPath: PathLike, newPath: PathLike): Promise<void> {
  return operations.link({ linkSync: sync.linkSync }, existingPath, newPath);
}
export async function lstat(path: PathLike, options?: StatOptions) {
  return operations.lstat({ lstatSync: sync.lstatSync }, path, options);
}
export async function lutimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
  return operations.lutimes({ lutimesSync: sync.lutimesSync }, path, atime, mtime);
}
export async function mkdir(path: PathLike, options?: Mode | MakeDirectoryOptions | null) {
  return operations.mkdir({ mkdirSync: sync.mkdirSync }, path, options);
}
export async function mkdtemp(
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return operations.mkdtemp({ mkdtempSync: sync.mkdtempSync }, prefix, options);
}
export async function mkdtempDisposable(
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding } | null,
) {
  const disposable = sync.mkdtempDisposableSync(prefix, options);
  const remove = async () => disposable.remove();
  return { path: disposable.path, remove, [Symbol.asyncDispose]: remove };
}
export async function open(path: PathLike, flags?: OpenMode, mode?: Mode) {
  return new FileHandle(sync, sync.openSync(path, flags, mode));
}
export async function opendir(path: PathLike, options?: OpenDirOptions) {
  return operations.opendir({ opendirSync: sync.opendirSync }, path, options);
}
export async function readFile(
  file: PathLike | number,
  options?: BufferEncoding | FlagOptions | null,
) {
  return operations.readFile({ readFileSync: sync.readFileSync }, file, options);
}
export async function readdir(path: PathLike, options?: BufferEncoding | ReaddirOptions | null) {
  return operations.readdir({ readdirSync: sync.readdirSync }, path, options);
}
export async function readlink(
  path: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return operations.readlink({ readlinkSync: sync.readlinkSync }, path, options);
}
export async function realpath(
  path: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return operations.realpath({ realpathSync: sync.realpathSync }, path, options);
}
export async function rename(oldPath: PathLike, newPath: PathLike): Promise<void> {
  return operations.rename({ renameSync: sync.renameSync }, oldPath, newPath);
}
export async function rm(path: PathLike, options?: RemoveOptions): Promise<void> {
  return operations.rm({ rmSync: sync.rmSync }, path, options);
}
export async function rmdir(path: PathLike, options?: RemoveOptions): Promise<void> {
  return operations.rmdir({ rmdirSync: sync.rmdirSync }, path, options);
}
export async function stat(path: PathLike, options?: StatOptions) {
  return operations.stat({ statSync: sync.statSync }, path, options);
}
export async function statfs(path: PathLike, options?: { bigint?: boolean }) {
  return operations.statfs({ statfsSync: sync.statfsSync }, path, options);
}
export async function symlink(
  target: PathLike,
  path: PathLike,
  type?: "dir" | "file" | "junction" | null,
): Promise<void> {
  return operations.symlink({ symlinkSync: sync.symlinkSync }, target, path, type);
}
export async function truncate(path: PathLike, length?: number): Promise<void> {
  return operations.truncate({ truncateSync: sync.truncateSync }, path, length);
}
export async function unlink(path: PathLike): Promise<void> {
  return operations.unlink({ unlinkSync: sync.unlinkSync }, path);
}
export async function utimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
  return operations.utimes({ utimesSync: sync.utimesSync }, path, atime, mtime);
}
export function watch(..._args: unknown[]): never {
  return operations.watch({}, ..._args);
}
export async function writeFile(
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
): Promise<void> {
  return operations.writeFile({ writeFileSync: sync.writeFileSync }, file, data, options);
}
export { constants };
const promises = {
  constants,
  access,
  appendFile,
  chmod,
  chown,
  copyFile,
  cp,
  glob,
  lchmod,
  lchown,
  link,
  lstat,
  lutimes,
  mkdir,
  mkdtemp,
  mkdtempDisposable,
  open,
  opendir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  symlink,
  truncate,
  unlink,
  utimes,
  watch,
  writeFile,
};
export default promises;
