import { deprecatedNodeApi, unsupportedNodeApi } from "../../errors/core.js";
import type { FsCore } from "../core.js";
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
} from "../public-types.js";
export function access(core: Pick<FsCore, "accessSync">, path: PathLike, mode?: number) {
  core.accessSync(path, mode);
}
export function appendFile(
  core: Pick<FsCore, "appendFileSync">,
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
) {
  core.appendFileSync(file, data, options);
}
export function chmod(core: Pick<FsCore, "chmodSync">, path: PathLike, mode: Mode) {
  core.chmodSync(path, mode);
}
export function chown(core: Pick<FsCore, "chownSync">, path: PathLike, uid: number, gid: number) {
  core.chownSync(path, uid, gid);
}
export function copyFile(
  core: Pick<FsCore, "copyFileSync">,
  source: PathLike,
  destination: PathLike,
  mode?: number,
) {
  core.copyFileSync(source, destination, mode);
}
export function cp(
  core: Pick<FsCore, "cpSync">,
  source: PathLike,
  destination: PathLike,
  options?: CopyOptions,
) {
  core.cpSync(source, destination, options);
}
export function glob(
  core: Pick<FsCore, "globSync">,
  pattern: string | readonly string[],
  options?: GlobOptions,
) {
  return core.globSync(pattern, options);
}
export function lchmod(_core: Pick<FsCore, never>, _path: PathLike, _mode: Mode): never {
  throw deprecatedNodeApi("fsPromises.lchmod");
}
export function lchown(core: Pick<FsCore, "lchownSync">, path: PathLike, uid: number, gid: number) {
  core.lchownSync(path, uid, gid);
}
export function link(core: Pick<FsCore, "linkSync">, existingPath: PathLike, newPath: PathLike) {
  core.linkSync(existingPath, newPath);
}
export function lstat(core: Pick<FsCore, "lstatSync">, path: PathLike, options?: StatOptions) {
  return core.lstatSync(path, options);
}
export function lutimes(
  core: Pick<FsCore, "lutimesSync">,
  path: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
) {
  core.lutimesSync(path, atime, mtime);
}
export function mkdir(
  core: Pick<FsCore, "mkdirSync">,
  path: PathLike,
  options?: Mode | MakeDirectoryOptions | null,
) {
  return core.mkdirSync(path, options);
}
export function mkdtemp(
  core: Pick<FsCore, "mkdtempSync">,
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return core.mkdtempSync(prefix, options);
}
export function mkdtempDisposable(
  core: Pick<FsCore, "mkdtempDisposable">,
  prefix: string,
  options?: BufferEncoding | { encoding?: BufferEncoding } | null,
) {
  return core.mkdtempDisposable(prefix, options);
}
export function open(core: Pick<FsCore, "open">, path: PathLike, flags?: OpenMode, mode?: Mode) {
  return core.open(path, flags, mode);
}
export function opendir(
  core: Pick<FsCore, "opendirSync">,
  path: PathLike,
  options?: OpenDirOptions,
) {
  return core.opendirSync(path, options);
}
export function readFile(
  core: Pick<FsCore, "readFileSync">,
  file: PathLike | number,
  options?: BufferEncoding | FlagOptions | null,
) {
  return core.readFileSync(file, options);
}
export function readdir(
  core: Pick<FsCore, "readdirSync">,
  path: PathLike,
  options?: BufferEncoding | ReaddirOptions | null,
) {
  return core.readdirSync(path, options);
}
export function readlink(
  core: Pick<FsCore, "readlinkSync">,
  path: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return core.readlinkSync(path, options);
}
export function realpath(
  core: Pick<FsCore, "realpathSync">,
  path: PathLike,
  options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
) {
  return core.realpathSync(path, options);
}
export function rename(core: Pick<FsCore, "renameSync">, oldPath: PathLike, newPath: PathLike) {
  core.renameSync(oldPath, newPath);
}
export function rm(core: Pick<FsCore, "rmSync">, path: PathLike, options?: RemoveOptions) {
  core.rmSync(path, options);
}
export function rmdir(core: Pick<FsCore, "rmdirSync">, path: PathLike, options?: RemoveOptions) {
  core.rmdirSync(path, options);
}
export function stat(core: Pick<FsCore, "statSync">, path: PathLike, options?: StatOptions) {
  return core.statSync(path, options);
}
export function statfs(
  core: Pick<FsCore, "statfsSync">,
  path: PathLike,
  options?: { bigint?: boolean },
) {
  return core.statfsSync(path, options);
}
export function symlink(
  core: Pick<FsCore, "symlinkSync">,
  target: PathLike,
  path: PathLike,
  type?: "dir" | "file" | "junction" | null,
) {
  core.symlinkSync(target, path, type);
}
export function truncate(core: Pick<FsCore, "truncateSync">, path: PathLike, length?: number) {
  core.truncateSync(path, length);
}
export function unlink(core: Pick<FsCore, "unlinkSync">, path: PathLike) {
  core.unlinkSync(path);
}
export function utimes(
  core: Pick<FsCore, "utimesSync">,
  path: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
) {
  core.utimesSync(path, atime, mtime);
}
export function watch(_core: Pick<FsCore, never>, ..._args: unknown[]): never {
  throw unsupportedNodeApi(
    "fsPromises.watch",
    "the filesystem WIT interface does not model watcher resources",
  );
}
export function writeFile(
  core: Pick<FsCore, "writeFileSync">,
  file: PathLike | number,
  data: FileData,
  options?: BufferEncoding | FlagOptions | null,
) {
  core.writeFileSync(file, data, options);
}
