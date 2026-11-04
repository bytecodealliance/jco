import { constants } from "./constants.js";
import type { FsCore } from "./core.js";
import * as operations from "./optional/promise-operations.js";
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
export function createFsPromises(core: FsCore) {
  return {
    constants,
    async access(path: PathLike, mode?: number): Promise<void> {
      return operations.access(core, path, mode);
    },
    async appendFile(
      file: PathLike | number,
      data: FileData,
      options?: BufferEncoding | FlagOptions | null,
    ): Promise<void> {
      return operations.appendFile(core, file, data, options);
    },
    async chmod(path: PathLike, mode: Mode): Promise<void> {
      return operations.chmod(core, path, mode);
    },
    async chown(path: PathLike, uid: number, gid: number): Promise<void> {
      return operations.chown(core, path, uid, gid);
    },
    async copyFile(source: PathLike, destination: PathLike, mode?: number): Promise<void> {
      return operations.copyFile(core, source, destination, mode);
    },
    async cp(source: PathLike, destination: PathLike, options?: CopyOptions): Promise<void> {
      return operations.cp(core, source, destination, options);
    },
    async glob(pattern: string | readonly string[], options?: GlobOptions) {
      return operations.glob(core, pattern, options);
    },
    async lchmod(_path: PathLike, _mode: Mode): Promise<never> {
      return operations.lchmod(core, _path, _mode);
    },
    async lchown(path: PathLike, uid: number, gid: number): Promise<void> {
      return operations.lchown(core, path, uid, gid);
    },
    async link(existingPath: PathLike, newPath: PathLike): Promise<void> {
      return operations.link(core, existingPath, newPath);
    },
    async lstat(path: PathLike, options?: StatOptions) {
      return operations.lstat(core, path, options);
    },
    async lutimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
      return operations.lutimes(core, path, atime, mtime);
    },
    async mkdir(path: PathLike, options?: Mode | MakeDirectoryOptions | null) {
      return operations.mkdir(core, path, options);
    },
    async mkdtemp(
      prefix: string,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return operations.mkdtemp(core, prefix, options);
    },
    async mkdtempDisposable(
      prefix: string,
      options?: BufferEncoding | { encoding?: BufferEncoding } | null,
    ) {
      return operations.mkdtempDisposable(core, prefix, options);
    },
    async open(path: PathLike, flags?: OpenMode, mode?: Mode) {
      return operations.open(core, path, flags, mode);
    },
    async opendir(path: PathLike, options?: OpenDirOptions) {
      return operations.opendir(core, path, options);
    },
    async readFile(file: PathLike | number, options?: BufferEncoding | FlagOptions | null) {
      return operations.readFile(core, file, options);
    },
    async readdir(path: PathLike, options?: BufferEncoding | ReaddirOptions | null) {
      return operations.readdir(core, path, options);
    },
    async readlink(
      path: PathLike,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return operations.readlink(core, path, options);
    },
    async realpath(
      path: PathLike,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return operations.realpath(core, path, options);
    },
    async rename(oldPath: PathLike, newPath: PathLike): Promise<void> {
      return operations.rename(core, oldPath, newPath);
    },
    async rm(path: PathLike, options?: RemoveOptions): Promise<void> {
      return operations.rm(core, path, options);
    },
    async rmdir(path: PathLike, options?: RemoveOptions): Promise<void> {
      return operations.rmdir(core, path, options);
    },
    async stat(path: PathLike, options?: StatOptions) {
      return operations.stat(core, path, options);
    },
    async statfs(path: PathLike, options?: { bigint?: boolean }) {
      return operations.statfs(core, path, options);
    },
    async symlink(
      target: PathLike,
      path: PathLike,
      type?: "dir" | "file" | "junction" | null,
    ): Promise<void> {
      return operations.symlink(core, target, path, type);
    },
    async truncate(path: PathLike, length?: number): Promise<void> {
      return operations.truncate(core, path, length);
    },
    async unlink(path: PathLike): Promise<void> {
      return operations.unlink(core, path);
    },
    async utimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
      return operations.utimes(core, path, atime, mtime);
    },
    watch(..._args: unknown[]): never {
      return operations.watch(core, ..._args);
    },
    async writeFile(
      file: PathLike | number,
      data: FileData,
      options?: BufferEncoding | FlagOptions | null,
    ): Promise<void> {
      return operations.writeFile(core, file, data, options);
    },
  };
}
export type FsPromises = ReturnType<typeof createFsPromises>;
