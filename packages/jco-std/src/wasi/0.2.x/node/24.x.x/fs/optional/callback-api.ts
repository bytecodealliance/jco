import { deprecatedNodeApi } from "../../errors/core.js";
import * as operations from "./callback-operations.js";
import { unsupportedFsApi } from "../operations.js";
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
import * as sync from "../sync.js";
type Callback = (error: Error | null, ...values: unknown[]) => void;
export function access(
  path: PathLike,
  modeOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.access({ accessSync: sync.accessSync }, path, modeOrCallback, maybeCallback);
}
export function appendFile(
  file: PathLike | number,
  data: FileData,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.appendFile(
    { appendFileSync: sync.appendFileSync },
    file,
    data,
    optionsOrCallback,
    maybeCallback,
  );
}
export function chmod(path: PathLike, mode: Mode, cb: Callback): void {
  return operations.chmod({ chmodSync: sync.chmodSync }, path, mode, cb);
}
export function chown(path: PathLike, uid: number, gid: number, cb: Callback): void {
  return operations.chown({ chownSync: sync.chownSync }, path, uid, gid, cb);
}
export function close(
  fd: number,
  cb: Callback = (error) => {
    if (error) {
      throw error;
    }
  },
): void {
  return operations.close({ closeSync: sync.closeSync }, fd, cb);
}
export function copyFile(
  source: PathLike,
  destination: PathLike,
  modeOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.copyFile(
    { copyFileSync: sync.copyFileSync },
    source,
    destination,
    modeOrCallback,
    maybeCallback,
  );
}
export function cp(
  source: PathLike,
  destination: PathLike,
  optionsOrCallback: CopyOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.cp(
    { cpSync: sync.cpSync },
    source,
    destination,
    optionsOrCallback,
    maybeCallback,
  );
}
export function fchmod(fd: number, mode: Mode, cb: Callback): void {
  return operations.fchmod({ fchmodSync: sync.fchmodSync }, fd, mode, cb);
}
export function fchown(fd: number, uid: number, gid: number, cb: Callback): void {
  return operations.fchown({ fchownSync: sync.fchownSync }, fd, uid, gid, cb);
}
export function fdatasync(fd: number, cb: Callback): void {
  return operations.fdatasync({ fdatasyncSync: sync.fdatasyncSync }, fd, cb);
}
export function fstat(
  fd: number,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.fstat({ fstatSync: sync.fstatSync }, fd, optionsOrCallback, maybeCallback);
}
export function fsync(fd: number, cb: Callback): void {
  return operations.fsync({ fsyncSync: sync.fsyncSync }, fd, cb);
}
export function ftruncate(
  fd: number,
  lengthOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.ftruncate(
    { ftruncateSync: sync.ftruncateSync },
    fd,
    lengthOrCallback,
    maybeCallback,
  );
}
export function futimes(fd: number, atime: TimeLike, mtime: TimeLike, cb: Callback): void {
  return operations.futimes({ futimesSync: sync.futimesSync }, fd, atime, mtime, cb);
}
export function glob(
  pattern: string | readonly string[],
  optionsOrCallback: GlobOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.glob({ globSync: sync.globSync }, pattern, optionsOrCallback, maybeCallback);
}
export function lchown(path: PathLike, uid: number, gid: number, cb: Callback): void {
  return operations.lchown({ lchownSync: sync.lchownSync }, path, uid, gid, cb);
}
export function link(existingPath: PathLike, newPath: PathLike, cb: Callback): void {
  return operations.link({ linkSync: sync.linkSync }, existingPath, newPath, cb);
}
export function lstat(
  path: PathLike,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.lstat({ lstatSync: sync.lstatSync }, path, optionsOrCallback, maybeCallback);
}
export function lutimes(path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void {
  return operations.lutimes({ lutimesSync: sync.lutimesSync }, path, atime, mtime, cb);
}
export function mkdir(
  path: PathLike,
  optionsOrCallback: Mode | MakeDirectoryOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.mkdir({ mkdirSync: sync.mkdirSync }, path, optionsOrCallback, maybeCallback);
}
export function mkdtemp(
  prefix: string,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.mkdtemp(
    { mkdtempSync: sync.mkdtempSync },
    prefix,
    optionsOrCallback,
    maybeCallback,
  );
}
export function open(
  path: PathLike,
  flagsOrCallback: OpenMode | Callback,
  modeOrCallback?: Mode | Callback,
  maybeCallback?: Callback,
): void {
  return operations.open(
    { openSync: sync.openSync },
    path,
    flagsOrCallback,
    modeOrCallback,
    maybeCallback,
  );
}
export function opendir(
  path: PathLike,
  optionsOrCallback: OpenDirOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.opendir(
    { opendirSync: sync.opendirSync },
    path,
    optionsOrCallback,
    maybeCallback,
  );
}
export function readFile(
  file: PathLike | number,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.readFile(
    { readFileSync: sync.readFileSync },
    file,
    optionsOrCallback,
    maybeCallback,
  );
}
export function readdir(
  path: PathLike,
  optionsOrCallback: BufferEncoding | ReaddirOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.readdir(
    { readdirSync: sync.readdirSync },
    path,
    optionsOrCallback,
    maybeCallback,
  );
}
export function readlink(
  path: PathLike,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.readlink(
    { readlinkSync: sync.readlinkSync },
    path,
    optionsOrCallback,
    maybeCallback,
  );
}
function realpathOperation(
  path: PathLike,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.realpathOperation(
    { realpathSync: sync.realpathSync },
    path,
    optionsOrCallback,
    maybeCallback,
  );
}
export function rename(oldPath: PathLike, newPath: PathLike, cb: Callback): void {
  return operations.rename({ renameSync: sync.renameSync }, oldPath, newPath, cb);
}
export function rm(
  path: PathLike,
  optionsOrCallback: RemoveOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.rm({ rmSync: sync.rmSync }, path, optionsOrCallback, maybeCallback);
}
export function rmdir(
  path: PathLike,
  optionsOrCallback: RemoveOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.rmdir({ rmdirSync: sync.rmdirSync }, path, optionsOrCallback, maybeCallback);
}
export function stat(
  path: PathLike,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return operations.stat({ statSync: sync.statSync }, path, optionsOrCallback, maybeCallback);
}
export function statfs(
  path: PathLike,
  optionsOrCallback: { bigint?: boolean } | Callback,
  maybeCallback?: Callback,
): void {
  return operations.statfs({ statfsSync: sync.statfsSync }, path, optionsOrCallback, maybeCallback);
}
export function symlink(
  target: PathLike,
  path: PathLike,
  typeOrCallback: "dir" | "file" | "junction" | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.symlink(
    { symlinkSync: sync.symlinkSync },
    target,
    path,
    typeOrCallback,
    maybeCallback,
  );
}
export function truncate(
  path: PathLike,
  lengthOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.truncate(
    { truncateSync: sync.truncateSync },
    path,
    lengthOrCallback,
    maybeCallback,
  );
}
export function unlink(path: PathLike, cb: Callback): void {
  return operations.unlink({ unlinkSync: sync.unlinkSync }, path, cb);
}
export function utimes(path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void {
  return operations.utimes({ utimesSync: sync.utimesSync }, path, atime, mtime, cb);
}
export function writeFile(
  file: PathLike | number,
  data: FileData,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return operations.writeFile(
    { writeFileSync: sync.writeFileSync },
    file,
    data,
    optionsOrCallback,
    maybeCallback,
  );
}
export function read(...input: unknown[]): void {
  return operations.read({ readSync: sync.readSync }, ...input);
}
export function write(...input: unknown[]): void {
  return operations.write({ writeSync: sync.writeSync }, ...input);
}
export function readv(
  fd: number,
  buffers: readonly ArrayBufferView[],
  positionOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.readv(
    { readvSync: sync.readvSync },
    fd,
    buffers,
    positionOrCallback,
    maybeCallback,
  );
}
export function writev(
  fd: number,
  buffers: readonly ArrayBufferView[],
  positionOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return operations.writev(
    { writevSync: sync.writevSync },
    fd,
    buffers,
    positionOrCallback,
    maybeCallback,
  );
}
// Only attaches an alias to a newly allocated function.
export const realpath = /* @__PURE__ */ Object.assign(realpathOperation, {
  native: (...args: Parameters<typeof realpathOperation>) => realpathOperation(...args),
});
export function exists(..._args: unknown[]): never {
  throw deprecatedNodeApi("fs.exists", "fs.stat or fs.access");
}
export function lchmod(..._args: unknown[]): never {
  throw deprecatedNodeApi("fs.lchmod");
}
export function openAsBlob(..._args: unknown[]): never {
  return unsupportedFsApi("fs.openAsBlob");
}
export function unwatchFile(..._args: unknown[]): never {
  return unsupportedFsApi("fs.unwatchFile");
}
export function watch(..._args: unknown[]): never {
  return unsupportedFsApi("fs.watch");
}
export function watchFile(..._args: unknown[]): never {
  return unsupportedFsApi("fs.watchFile");
}
