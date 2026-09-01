import { deprecatedNodeApi, invalidArgType } from "../errors/core.js";

import {
  Dir,
  Dirent,
  FileReadStream,
  FileWriteStream,
  ReadStream,
  Stats,
  Utf8Stream,
  WriteStream,
} from "./classes.js";
import { constants, F_OK } from "./constants.js";
import { type FsCore, toUnixTimestamp, unsupportedFsApi } from "./core.js";
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
  ReadOptions,
  ReaddirOptions,
  RemoveOptions,
  StatOptions,
  TimeLike,
  WriteOptions,
} from "./public-types.js";

type Callback = (error: Error | null, ...values: unknown[]) => void;

function callback(value: unknown): Callback {
  if (typeof value !== "function") {
    throw invalidArgType("callback", "Function", value);
  }
  return value as Callback;
}

function deferred<T>(
  operation: () => T,
  cb: unknown,
  values: (result: T) => unknown[] = (result) => [result],
): void {
  const done = callback(cb);
  queueMicrotask(() => {
    let result: T;
    try {
      result = operation();
    } catch (error) {
      done(error as Error);
      return;
    }
    done(null, ...values(result));
  });
}

function splitCallback(args: unknown[]): { args: unknown[]; callback: Callback } {
  const values = [...args];
  return { args: values, callback: callback(values.pop()) };
}

/** Build Node's callback/synchronous facade over one filesystem core. */
export function createFs(core: FsCore, promises: FsPromises) {
  const access = (
    path: PathLike,
    modeOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void => {
    const mode = typeof modeOrCallback === "number" ? modeOrCallback : F_OK;
    deferred(
      () => core.accessSync(path, mode),
      typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback,
      () => [],
    );
  };

  const appendFile = (
    file: PathLike | number,
    data: FileData,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void => {
    const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
    deferred(
      () => core.appendFileSync(file, data, options),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
      () => [],
    );
  };

  const chmod = (path: PathLike, mode: Mode, cb: Callback): void =>
    deferred(
      () => core.chmodSync(path, mode),
      cb,
      () => [],
    );

  const chown = (path: PathLike, uid: number, gid: number, cb: Callback): void =>
    deferred(
      () => core.chownSync(path, uid, gid),
      cb,
      () => [],
    );

  const close = (
    fd: number,
    cb: Callback = (error) => {
      if (error) {
        throw error;
      }
    },
  ): void =>
    deferred(
      () => core.closeSync(fd),
      cb,
      () => [],
    );

  const copyFile = (
    source: PathLike,
    destination: PathLike,
    modeOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.copyFileSync(
          source,
          destination,
          typeof modeOrCallback === "number" ? modeOrCallback : 0,
        ),
      typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback,
      () => [],
    );

  const cp = (
    source: PathLike,
    destination: PathLike,
    optionsOrCallback: CopyOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.cpSync(
          source,
          destination,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
      () => [],
    );

  const fchmod = (fd: number, mode: Mode, cb: Callback): void =>
    deferred(
      () => core.fchmodSync(fd, mode),
      cb,
      () => [],
    );

  const fchown = (fd: number, uid: number, gid: number, cb: Callback): void =>
    deferred(
      () => core.fchownSync(fd, uid, gid),
      cb,
      () => [],
    );

  const fdatasync = (fd: number, cb: Callback): void =>
    deferred(
      () => core.fdatasyncSync(fd),
      cb,
      () => [],
    );

  const fstat = (
    fd: number,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.fstatSync(fd, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const fsync = (fd: number, cb: Callback): void =>
    deferred(
      () => core.fsyncSync(fd),
      cb,
      () => [],
    );

  const ftruncate = (
    fd: number,
    lengthOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () => core.ftruncateSync(fd, typeof lengthOrCallback === "number" ? lengthOrCallback : 0),
      typeof lengthOrCallback === "function" ? lengthOrCallback : maybeCallback,
      () => [],
    );

  const futimes = (fd: number, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    deferred(
      () => core.futimesSync(fd, atime, mtime),
      cb,
      () => [],
    );

  const glob = (
    pattern: string | readonly string[],
    optionsOrCallback: GlobOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.globSync(
          pattern,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const lchown = (path: PathLike, uid: number, gid: number, cb: Callback): void =>
    deferred(
      () => core.lchownSync(path, uid, gid),
      cb,
      () => [],
    );

  const link = (existingPath: PathLike, newPath: PathLike, cb: Callback): void =>
    deferred(
      () => core.linkSync(existingPath, newPath),
      cb,
      () => [],
    );

  const lstat = (
    path: PathLike,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.lstatSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const lutimes = (path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    deferred(
      () => core.lutimesSync(path, atime, mtime),
      cb,
      () => [],
    );

  const mkdir = (
    path: PathLike,
    optionsOrCallback: Mode | MakeDirectoryOptions | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.mkdirSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const mkdtemp = (
    prefix: string,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.mkdtempSync(
          prefix,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const open = (
    path: PathLike,
    flagsOrCallback: OpenMode | Callback,
    modeOrCallback?: Mode | Callback,
    maybeCallback?: Callback,
  ): void => {
    const flags = typeof flagsOrCallback === "function" ? "r" : flagsOrCallback;
    const mode =
      typeof modeOrCallback === "function" || modeOrCallback === undefined ? 0o666 : modeOrCallback;
    const cb =
      typeof flagsOrCallback === "function"
        ? flagsOrCallback
        : typeof modeOrCallback === "function"
          ? modeOrCallback
          : maybeCallback;
    deferred(() => core.openSync(path, flags, mode), cb);
  };

  const opendir = (
    path: PathLike,
    optionsOrCallback: OpenDirOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.opendirSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const readFile = (
    file: PathLike | number,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.readFileSync(
          file,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const readdir = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | ReaddirOptions | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.readdirSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const readlink = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.readlinkSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const realpathOperation = (
    path: PathLike,
    optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.realpathSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

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
    deferred(
      () => core.renameSync(oldPath, newPath),
      cb,
      () => [],
    );

  const rm = (
    path: PathLike,
    optionsOrCallback: RemoveOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.rmSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
      () => [],
    );

  const rmdir = (
    path: PathLike,
    optionsOrCallback: RemoveOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.rmdirSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
      () => [],
    );

  const stat = (
    path: PathLike,
    optionsOrCallback: StatOptions | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.statSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const statfs = (
    path: PathLike,
    optionsOrCallback: { bigint?: boolean } | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.statfsSync(
          path,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    );

  const symlink = (
    target: PathLike,
    path: PathLike,
    typeOrCallback: "dir" | "file" | "junction" | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.symlinkSync(
          target,
          path,
          typeof typeOrCallback === "function" ? undefined : typeOrCallback,
        ),
      typeof typeOrCallback === "function" ? typeOrCallback : maybeCallback,
      () => [],
    );

  const truncate = (
    path: PathLike,
    lengthOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () => core.truncateSync(path, typeof lengthOrCallback === "number" ? lengthOrCallback : 0),
      typeof lengthOrCallback === "function" ? lengthOrCallback : maybeCallback,
      () => [],
    );

  const unlink = (path: PathLike, cb: Callback): void =>
    deferred(
      () => core.unlinkSync(path),
      cb,
      () => [],
    );

  const utimes = (path: PathLike, atime: TimeLike, mtime: TimeLike, cb: Callback): void =>
    deferred(
      () => core.utimesSync(path, atime, mtime),
      cb,
      () => [],
    );

  const writeFile = (
    file: PathLike | number,
    data: FileData,
    optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.writeFileSync(
          file,
          data,
          typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
        ),
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
      () => [],
    );

  const read = (...input: unknown[]): void => {
    const { args, callback: cb } = splitCallback(input);
    const [descriptor, buffer, offsetOrOptions, length, position] = args;
    if (!ArrayBuffer.isView(buffer)) {
      throw invalidArgType("buffer", ["Buffer", "TypedArray", "DataView"], buffer);
    }
    deferred(
      () =>
        typeof offsetOrOptions === "object" && offsetOrOptions !== null
          ? core.readSync(descriptor as number, buffer, offsetOrOptions as ReadOptions)
          : core.readSync(
              descriptor as number,
              buffer,
              offsetOrOptions as number,
              length as number,
              position as number | bigint | null,
            ),
      cb,
      (bytesRead) => [bytesRead, buffer],
    );
  };

  const write = (...input: unknown[]): void => {
    const { args, callback: cb } = splitCallback(input);
    const [descriptor, value, offsetOrPosition, lengthOrEncoding, position] = args;
    if (typeof value !== "string" && !ArrayBuffer.isView(value)) {
      throw invalidArgType("buffer", ["string", "Buffer", "TypedArray", "DataView"], value);
    }
    deferred(
      () => {
        if (typeof value === "string") {
          return core.writeSync(
            descriptor as number,
            value,
            offsetOrPosition as number | null,
            lengthOrEncoding as BufferEncoding,
          );
        }
        return typeof offsetOrPosition === "object" && offsetOrPosition !== null
          ? core.writeSync(descriptor as number, value, offsetOrPosition as WriteOptions)
          : core.writeSync(
              descriptor as number,
              value,
              offsetOrPosition as number,
              lengthOrEncoding as number,
              position as number | null,
            );
      },
      cb,
      (bytesWritten) => [bytesWritten, value],
    );
  };

  const readv = (
    fd: number,
    buffers: readonly ArrayBufferView[],
    positionOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.readvSync(
          fd,
          buffers,
          typeof positionOrCallback === "number" ? positionOrCallback : undefined,
        ),
      typeof positionOrCallback === "function" ? positionOrCallback : maybeCallback,
      (bytesRead) => [bytesRead, buffers],
    );

  const writev = (
    fd: number,
    buffers: readonly ArrayBufferView[],
    positionOrCallback: number | Callback,
    maybeCallback?: Callback,
  ): void =>
    deferred(
      () =>
        core.writevSync(
          fd,
          buffers,
          typeof positionOrCallback === "number" ? positionOrCallback : undefined,
        ),
      typeof positionOrCallback === "function" ? positionOrCallback : maybeCallback,
      (bytesWritten) => [bytesWritten, buffers],
    );

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
    createReadStream: unsupported("fs.createReadStream"),
    createWriteStream: unsupported("fs.createWriteStream"),
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
