import { deprecatedNodeApi } from "../errors/core.js";

import * as operations from "./optional/callback-operations.js";
import { Dir, Dirent, Stats, Utf8Stream } from "./classes.js";
import { constants } from "./constants.js";
import type { FsCore } from "./core.js";
import { toUnixTimestamp, unsupportedFsApi } from "./operations.js";
import type { FsPromises } from "./promises.js";
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
} from "./public-types.js";
import { createFsStreams } from "./streams.js";

type Callback = (error: Error | null, ...values: unknown[]) => void;

/** Build Node's callback/synchronous facade over one filesystem core. */
export function createFs(core: FsCore, promises: FsPromises) {
  const {
    ReadStream,
    WriteStream,
    FileReadStream,
    FileWriteStream,
    createReadStream,
    createWriteStream,
  } = createFsStreams(core);
  const access = (
    path: PathLike,
    modeOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.access(core, path, modeOrCallback, maybeCallback);

  const appendFile = (
    file: PathLike | number,
    data: FileData,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.appendFile(core, file, data, optionsOrCallback, maybeCallback);

  const chmod = (path: PathLike, mode: Mode, cb: Callback): void =>
    operations.chmod(core, path, mode, cb);

  const chown = (path: PathLike, uid: number, gid: number, cb: Callback): void =>
    operations.chown(core, path, uid, gid, cb);

  const close = (
    fd: number,
    cb: Callback = (error) => {
      if (error) {
        throw error;
      }
    },
  ): void => operations.close(core, fd, cb);

  const copyFile = (
    source: PathLike,
    destination: PathLike,
    modeOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.copyFile(core, source, destination, modeOrCallback, maybeCallback);

  const cp = (
    source: PathLike,
    destination: PathLike,
    optionsOrCallback: CopyOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.cp(core, source, destination, optionsOrCallback, maybeCallback);

  const fchmod = (fd: number, mode: Mode, cb: Callback): void =>
    operations.fchmod(core, fd, mode, cb);

  const fchown = (fd: number, uid: number, gid: number, cb: Callback): void =>
    operations.fchown(core, fd, uid, gid, cb);

  const fdatasync = (fd: number, cb: Callback): void => operations.fdatasync(core, fd, cb);

  const fstat = (
    fd: number,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.fstat(core, fd, optionsOrCallback, maybeCallback);

  const fsync = (fd: number, cb: Callback): void => operations.fsync(core, fd, cb);

  const ftruncate = (
    fd: number,
    lengthOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.ftruncate(core, fd, lengthOrCallback, maybeCallback);

  const futimes = (fd: number, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    operations.futimes(core, fd, atime, mtime, cb);

  const glob = (
    pattern: string | readonly string[],
    optionsOrCallback: GlobOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.glob(core, pattern, optionsOrCallback, maybeCallback);

  const lchown = (path: PathLike, uid: number, gid: number, cb: Callback): void =>
    operations.lchown(core, path, uid, gid, cb);

  const link = (existingPath: PathLike, newPath: PathLike, cb: Callback): void =>
    operations.link(core, existingPath, newPath, cb);

  const lstat = (
    path: PathLike,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.lstat(core, path, optionsOrCallback, maybeCallback);

  const lutimes = (path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    operations.lutimes(core, path, atime, mtime, cb);

  const mkdir = (
    path: PathLike,
    optionsOrCallback: Mode | MakeDirectoryOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.mkdir(core, path, optionsOrCallback, maybeCallback);

  const mkdtemp = (
    prefix: string,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.mkdtemp(core, prefix, optionsOrCallback, maybeCallback);

  const open = (
    path: PathLike,
    flagsOrCallback: OpenMode | Callback,
    modeOrCallback?: Mode | Callback,
    maybeCallback?: Callback,
  ): void => operations.open(core, path, flagsOrCallback, modeOrCallback, maybeCallback);

  const opendir = (
    path: PathLike,
    optionsOrCallback: OpenDirOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.opendir(core, path, optionsOrCallback, maybeCallback);

  const readFile = (
    file: PathLike | number,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.readFile(core, file, optionsOrCallback, maybeCallback);

  const readdir = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | ReaddirOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.readdir(core, path, optionsOrCallback, maybeCallback);

  const readlink = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.readlink(core, path, optionsOrCallback, maybeCallback);

  const realpathOperation = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.realpathOperation(core, path, optionsOrCallback, maybeCallback);

  const realpath = Object.assign(realpathOperation, {
    native: (
      path: PathLike,
      optionsOrCallback:
        | BufferEncoding
        | { encoding?: BufferEncoding | "buffer" }
        | Callback
        | null,
      maybeCallback?: Callback,
    ): void => realpathOperation(path, optionsOrCallback, maybeCallback),
  });

  const rename = (oldPath: PathLike, newPath: PathLike, cb: Callback): void =>
    operations.rename(core, oldPath, newPath, cb);

  const rm = (
    path: PathLike,
    optionsOrCallback: RemoveOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.rm(core, path, optionsOrCallback, maybeCallback);

  const rmdir = (
    path: PathLike,
    optionsOrCallback: RemoveOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.rmdir(core, path, optionsOrCallback, maybeCallback);

  const stat = (
    path: PathLike,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void => operations.stat(core, path, optionsOrCallback, maybeCallback);

  const statfs = (
    path: PathLike,
    optionsOrCallback: { bigint?: boolean } | Callback,
    maybeCallback?: Callback,
  ): void => operations.statfs(core, path, optionsOrCallback, maybeCallback);

  const symlink = (
    target: PathLike,
    path: PathLike,
    typeOrCallback: "dir" | "file" | "junction" | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.symlink(core, target, path, typeOrCallback, maybeCallback);

  const truncate = (
    path: PathLike,
    lengthOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.truncate(core, path, lengthOrCallback, maybeCallback);

  const unlink = (path: PathLike, cb: Callback): void => operations.unlink(core, path, cb);

  const utimes = (path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    operations.utimes(core, path, atime, mtime, cb);

  const writeFile = (
    file: PathLike | number,
    data: FileData,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => operations.writeFile(core, file, data, optionsOrCallback, maybeCallback);

  const read = (...input: unknown[]): void => operations.read(core, ...input);

  const write = (...input: unknown[]): void => operations.write(core, ...input);

  const readv = (
    fd: number,
    buffers: readonly ArrayBufferView[],
    positionOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.readv(core, fd, buffers, positionOrCallback, maybeCallback);

  const writev = (
    fd: number,
    buffers: readonly ArrayBufferView[],
    positionOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => operations.writev(core, fd, buffers, positionOrCallback, maybeCallback);

  const realpathSync = Object.assign(core.realpathSync.bind(core), {
    native: core.realpathSync.bind(core),
  });

  const unsupported =
    (api: string) =>
    (..._args: unknown[]): never =>
      unsupportedFsApi(api);

  const deprecated =
    (api: string, replacement?: string) =>
    (..._args: unknown[]): never => {
      throw deprecatedNodeApi(api, replacement);
    };

  return {
    constants,
    promises,
    Dir,
    Dirent,
    FileReadStream,
    FileWriteStream,
    ReadStream,
    Stats,
    Utf8Stream,
    WriteStream,
    _toUnixTimestamp: toUnixTimestamp,
    access,
    accessSync: core.accessSync.bind(core),
    appendFile,
    appendFileSync: core.appendFileSync.bind(core),
    chmod,
    chmodSync: core.chmodSync.bind(core),
    chown,
    chownSync: core.chownSync.bind(core),
    close,
    closeSync: core.closeSync.bind(core),
    copyFile,
    copyFileSync: core.copyFileSync.bind(core),
    cp,
    cpSync: core.cpSync.bind(core),
    createReadStream,
    createWriteStream,
    exists: deprecated("fs.exists", "fs.stat or fs.access"),
    existsSync: core.existsSync.bind(core),
    fchmod,
    fchmodSync: core.fchmodSync.bind(core),
    fchown,
    fchownSync: core.fchownSync.bind(core),
    fdatasync,
    fdatasyncSync: core.fdatasyncSync.bind(core),
    fstat,
    fstatSync: core.fstatSync.bind(core),
    fsync,
    fsyncSync: core.fsyncSync.bind(core),
    ftruncate,
    ftruncateSync: core.ftruncateSync.bind(core),
    futimes,
    futimesSync: core.futimesSync.bind(core),
    glob,
    globSync: core.globSync.bind(core),
    lchmod: deprecated("fs.lchmod"),
    lchmodSync: deprecated("fs.lchmodSync"),
    lchown,
    lchownSync: core.lchownSync.bind(core),
    link,
    linkSync: core.linkSync.bind(core),
    lstat,
    lstatSync: core.lstatSync.bind(core),
    lutimes,
    lutimesSync: core.lutimesSync.bind(core),
    mkdir,
    mkdirSync: core.mkdirSync.bind(core),
    mkdtemp,
    mkdtempSync: core.mkdtempSync.bind(core),
    mkdtempDisposableSync: core.mkdtempDisposableSync.bind(core),
    open,
    openAsBlob: unsupported("fs.openAsBlob"),
    openSync: core.openSync.bind(core),
    opendir,
    opendirSync: core.opendirSync.bind(core),
    read,
    readFile,
    readFileSync: core.readFileSync.bind(core),
    readSync: core.readSync.bind(core),
    readdir,
    readdirSync: core.readdirSync.bind(core),
    readlink,
    readlinkSync: core.readlinkSync.bind(core),
    readv,
    readvSync: core.readvSync.bind(core),
    realpath,
    realpathSync,
    rename,
    renameSync: core.renameSync.bind(core),
    rm,
    rmSync: core.rmSync.bind(core),
    rmdir,
    rmdirSync: core.rmdirSync.bind(core),
    stat,
    statSync: core.statSync.bind(core),
    statfs,
    statfsSync: core.statfsSync.bind(core),
    symlink,
    symlinkSync: core.symlinkSync.bind(core),
    truncate,
    truncateSync: core.truncateSync.bind(core),
    unlink,
    unlinkSync: core.unlinkSync.bind(core),
    unwatchFile: unsupported("fs.unwatchFile"),
    utimes,
    utimesSync: core.utimesSync.bind(core),
    watch: unsupported("fs.watch"),
    watchFile: unsupported("fs.watchFile"),
    write,
    writeFile,
    writeFileSync: core.writeFileSync.bind(core),
    writeSync: core.writeSync.bind(core),
    writev,
    writevSync: core.writevSync.bind(core),
  };
}

export type FsModule = ReturnType<typeof createFs>;
