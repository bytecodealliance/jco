import { invalidArgType } from "../../errors/core.js";
import { F_OK } from "../constants.js";
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
  ReadOptions,
  RemoveOptions,
  StatOptions,
  TimeLike,
  WriteOptions,
} from "../public-types.js";
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

export function access(
  core: Pick<FsCore, "accessSync">,
  path: PathLike,
  modeOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  const mode = typeof modeOrCallback === "number" ? modeOrCallback : F_OK;
  deferred(
    () => core.accessSync(path, mode),
    typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback,
    () => [],
  );
}
export function appendFile(
  core: Pick<FsCore, "appendFileSync">,
  file: PathLike | number,
  data: FileData,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
  deferred(
    () => core.appendFileSync(file, data, options),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    () => [],
  );
}
export function chmod(
  core: Pick<FsCore, "chmodSync">,
  path: PathLike,
  mode: Mode,
  cb: Callback,
): void {
  return deferred(
    () => core.chmodSync(path, mode),
    cb,
    () => [],
  );
}
export function chown(
  core: Pick<FsCore, "chownSync">,
  path: PathLike,
  uid: number,
  gid: number,
  cb: Callback,
): void {
  return deferred(
    () => core.chownSync(path, uid, gid),
    cb,
    () => [],
  );
}
export function close(
  core: Pick<FsCore, "closeSync">,
  fd: number,
  cb: Callback = (error) => {
    if (error) {
      throw error;
    }
  },
): void {
  return deferred(
    () => core.closeSync(fd),
    cb,
    () => [],
  );
}
export function copyFile(
  core: Pick<FsCore, "copyFileSync">,
  source: PathLike,
  destination: PathLike,
  modeOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.copyFileSync(
        source,
        destination,
        typeof modeOrCallback === "number" ? modeOrCallback : 0,
      ),
    typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback,
    () => [],
  );
}
export function cp(
  core: Pick<FsCore, "cpSync">,
  source: PathLike,
  destination: PathLike,
  optionsOrCallback: CopyOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.cpSync(
        source,
        destination,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    () => [],
  );
}
export function fchmod(
  core: Pick<FsCore, "fchmodSync">,
  fd: number,
  mode: Mode,
  cb: Callback,
): void {
  return deferred(
    () => core.fchmodSync(fd, mode),
    cb,
    () => [],
  );
}
export function fchown(
  core: Pick<FsCore, "fchownSync">,
  fd: number,
  uid: number,
  gid: number,
  cb: Callback,
): void {
  return deferred(
    () => core.fchownSync(fd, uid, gid),
    cb,
    () => [],
  );
}
export function fdatasync(core: Pick<FsCore, "fdatasyncSync">, fd: number, cb: Callback): void {
  return deferred(
    () => core.fdatasyncSync(fd),
    cb,
    () => [],
  );
}
export function fstat(
  core: Pick<FsCore, "fstatSync">,
  fd: number,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.fstatSync(fd, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function fsync(core: Pick<FsCore, "fsyncSync">, fd: number, cb: Callback): void {
  return deferred(
    () => core.fsyncSync(fd),
    cb,
    () => [],
  );
}
export function ftruncate(
  core: Pick<FsCore, "ftruncateSync">,
  fd: number,
  lengthOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () => core.ftruncateSync(fd, typeof lengthOrCallback === "number" ? lengthOrCallback : 0),
    typeof lengthOrCallback === "function" ? lengthOrCallback : maybeCallback,
    () => [],
  );
}
export function futimes(
  core: Pick<FsCore, "futimesSync">,
  fd: number,
  atime: TimeLike,
  mtime: TimeLike,
  cb: Callback,
): void {
  return deferred(
    () => core.futimesSync(fd, atime, mtime),
    cb,
    () => [],
  );
}
export function glob(
  core: Pick<FsCore, "globSync">,
  pattern: string | readonly string[],
  optionsOrCallback: GlobOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.globSync(
        pattern,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function lchown(
  core: Pick<FsCore, "lchownSync">,
  path: PathLike,
  uid: number,
  gid: number,
  cb: Callback,
): void {
  return deferred(
    () => core.lchownSync(path, uid, gid),
    cb,
    () => [],
  );
}
export function link(
  core: Pick<FsCore, "linkSync">,
  existingPath: PathLike,
  newPath: PathLike,
  cb: Callback,
): void {
  return deferred(
    () => core.linkSync(existingPath, newPath),
    cb,
    () => [],
  );
}
export function lstat(
  core: Pick<FsCore, "lstatSync">,
  path: PathLike,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.lstatSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function lutimes(
  core: Pick<FsCore, "lutimesSync">,
  path: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
  cb: Callback,
): void {
  return deferred(
    () => core.lutimesSync(path, atime, mtime),
    cb,
    () => [],
  );
}
export function mkdir(
  core: Pick<FsCore, "mkdirSync">,
  path: PathLike,
  optionsOrCallback: Mode | MakeDirectoryOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.mkdirSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function mkdtemp(
  core: Pick<FsCore, "mkdtempSync">,
  prefix: string,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.mkdtempSync(
        prefix,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function open(
  core: Pick<FsCore, "openSync">,
  path: PathLike,
  flagsOrCallback: OpenMode | Callback,
  modeOrCallback?: Mode | Callback,
  maybeCallback?: Callback,
): void {
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
}
export function opendir(
  core: Pick<FsCore, "opendirSync">,
  path: PathLike,
  optionsOrCallback: OpenDirOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.opendirSync(
        path,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function readFile(
  core: Pick<FsCore, "readFileSync">,
  file: PathLike | number,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.readFileSync(
        file,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function readdir(
  core: Pick<FsCore, "readdirSync">,
  path: PathLike,
  optionsOrCallback: BufferEncoding | ReaddirOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.readdirSync(
        path,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function readlink(
  core: Pick<FsCore, "readlinkSync">,
  path: PathLike,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.readlinkSync(
        path,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function realpathOperation(
  core: Pick<FsCore, "realpathSync">,
  path: PathLike,
  optionsOrCallback: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.realpathSync(
        path,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function rename(
  core: Pick<FsCore, "renameSync">,
  oldPath: PathLike,
  newPath: PathLike,
  cb: Callback,
): void {
  return deferred(
    () => core.renameSync(oldPath, newPath),
    cb,
    () => [],
  );
}
export function rm(
  core: Pick<FsCore, "rmSync">,
  path: PathLike,
  optionsOrCallback: RemoveOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.rmSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    () => [],
  );
}
export function rmdir(
  core: Pick<FsCore, "rmdirSync">,
  path: PathLike,
  optionsOrCallback: RemoveOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.rmdirSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    () => [],
  );
}
export function stat(
  core: Pick<FsCore, "statSync">,
  path: PathLike,
  optionsOrCallback: StatOptions | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.statSync(path, typeof optionsOrCallback === "function" ? undefined : optionsOrCallback),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function statfs(
  core: Pick<FsCore, "statfsSync">,
  path: PathLike,
  optionsOrCallback: { bigint?: boolean } | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.statfsSync(
        path,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
  );
}
export function symlink(
  core: Pick<FsCore, "symlinkSync">,
  target: PathLike,
  path: PathLike,
  typeOrCallback: "dir" | "file" | "junction" | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.symlinkSync(
        target,
        path,
        typeof typeOrCallback === "function" ? undefined : typeOrCallback,
      ),
    typeof typeOrCallback === "function" ? typeOrCallback : maybeCallback,
    () => [],
  );
}
export function truncate(
  core: Pick<FsCore, "truncateSync">,
  path: PathLike,
  lengthOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () => core.truncateSync(path, typeof lengthOrCallback === "number" ? lengthOrCallback : 0),
    typeof lengthOrCallback === "function" ? lengthOrCallback : maybeCallback,
    () => [],
  );
}
export function unlink(core: Pick<FsCore, "unlinkSync">, path: PathLike, cb: Callback): void {
  return deferred(
    () => core.unlinkSync(path),
    cb,
    () => [],
  );
}
export function utimes(
  core: Pick<FsCore, "utimesSync">,
  path: PathLike,
  atime: TimeLike,
  mtime: TimeLike,
  cb: Callback,
): void {
  return deferred(
    () => core.utimesSync(path, atime, mtime),
    cb,
    () => [],
  );
}
export function writeFile(
  core: Pick<FsCore, "writeFileSync">,
  file: PathLike | number,
  data: FileData,
  optionsOrCallback: BufferEncoding | FlagOptions | Callback | null,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.writeFileSync(
        file,
        data,
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      ),
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback,
    () => [],
  );
}
export function read(core: Pick<FsCore, "readSync">, ...input: unknown[]): void {
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
}
export function write(core: Pick<FsCore, "writeSync">, ...input: unknown[]): void {
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
}
export function readv(
  core: Pick<FsCore, "readvSync">,
  fd: number,
  buffers: readonly ArrayBufferView[],
  positionOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.readvSync(
        fd,
        buffers,
        typeof positionOrCallback === "number" ? positionOrCallback : undefined,
      ),
    typeof positionOrCallback === "function" ? positionOrCallback : maybeCallback,
    (bytesRead) => [bytesRead, buffers],
  );
}
export function writev(
  core: Pick<FsCore, "writevSync">,
  fd: number,
  buffers: readonly ArrayBufferView[],
  positionOrCallback: number | Callback,
  maybeCallback?: Callback,
): void {
  return deferred(
    () =>
      core.writevSync(
        fd,
        buffers,
        typeof positionOrCallback === "number" ? positionOrCallback : undefined,
      ),
    typeof positionOrCallback === "function" ? positionOrCallback : maybeCallback,
    (bytesWritten) => [bytesWritten, buffers],
  );
}
