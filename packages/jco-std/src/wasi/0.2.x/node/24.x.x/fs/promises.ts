import { deprecatedNodeApi, unsupportedNodeApi } from "../errors/core.js";

import { constants } from "./constants.js";
import type { FsCore } from "./core.js";
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

/** Build the promise facade over the same descriptor/state core as `node:fs`. */
export function createFsPromises(core: FsCore) {
  return {
    constants,
    async access(path: PathLike, mode?: number): Promise<void> {
      core.accessSync(path, mode);
    },

    async appendFile(
      file: PathLike | number,
      data: FileData,
      options?: BufferEncoding | FlagOptions | null,
    ): Promise<void> {
      core.appendFileSync(file, data, options);
    },

    async chmod(path: PathLike, mode: Mode): Promise<void> {
      core.chmodSync(path, mode);
    },

    async chown(path: PathLike, uid: number, gid: number): Promise<void> {
      core.chownSync(path, uid, gid);
    },

    async copyFile(source: PathLike, destination: PathLike, mode?: number): Promise<void> {
      core.copyFileSync(source, destination, mode);
    },

    async cp(source: PathLike, destination: PathLike, options?: CopyOptions): Promise<void> {
      core.cpSync(source, destination, options);
    },

    async glob(pattern: string | readonly string[], options?: GlobOptions) {
      return core.globSync(pattern, options);
    },

    async lchmod(_path: PathLike, _mode: Mode): Promise<never> {
      throw deprecatedNodeApi("fsPromises.lchmod");
    },

    async lchown(path: PathLike, uid: number, gid: number): Promise<void> {
      core.lchownSync(path, uid, gid);
    },

    async link(existingPath: PathLike, newPath: PathLike): Promise<void> {
      core.linkSync(existingPath, newPath);
    },

    async lstat(path: PathLike, options?: StatOptions) {
      return core.lstatSync(path, options);
    },

    async lutimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
      core.lutimesSync(path, atime, mtime);
    },

    async mkdir(path: PathLike, options?: Mode | MakeDirectoryOptions | null) {
      return core.mkdirSync(path, options);
    },

    async mkdtemp(
      prefix: string,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return core.mkdtempSync(prefix, options);
    },

    async mkdtempDisposable(
      prefix: string,
      options?: BufferEncoding | { encoding?: BufferEncoding } | null,
    ) {
      return core.mkdtempDisposable(prefix, options);
    },

    async open(path: PathLike, flags?: OpenMode, mode?: Mode) {
      return core.open(path, flags, mode);
    },

    async opendir(path: PathLike, options?: OpenDirOptions) {
      return core.opendirSync(path, options);
    },

    async readFile(file: PathLike | number, options?: BufferEncoding | FlagOptions | null) {
      return core.readFileSync(file, options);
    },

    async readdir(path: PathLike, options?: BufferEncoding | ReaddirOptions | null) {
      return core.readdirSync(path, options);
    },

    async readlink(
      path: PathLike,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return core.readlinkSync(path, options);
    },

    async realpath(
      path: PathLike,
      options?: BufferEncoding | { encoding?: BufferEncoding | "buffer" } | null,
    ) {
      return core.realpathSync(path, options);
    },

    async rename(oldPath: PathLike, newPath: PathLike): Promise<void> {
      core.renameSync(oldPath, newPath);
    },

    async rm(path: PathLike, options?: RemoveOptions): Promise<void> {
      core.rmSync(path, options);
    },

    async rmdir(path: PathLike, options?: RemoveOptions): Promise<void> {
      core.rmdirSync(path, options);
    },

    async stat(path: PathLike, options?: StatOptions) {
      return core.statSync(path, options);
    },

    async statfs(path: PathLike, options?: { bigint?: boolean }) {
      return core.statfsSync(path, options);
    },

    async symlink(
      target: PathLike,
      path: PathLike,
      type?: "dir" | "file" | "junction" | null,
    ): Promise<void> {
      core.symlinkSync(target, path, type);
    },

    async truncate(path: PathLike, length?: number): Promise<void> {
      core.truncateSync(path, length);
    },

    async unlink(path: PathLike): Promise<void> {
      core.unlinkSync(path);
    },

    async utimes(path: PathLike, atime: TimeLike, mtime: TimeLike): Promise<void> {
      core.utimesSync(path, atime, mtime);
    },

    watch(..._args: unknown[]): never {
      throw unsupportedNodeApi(
        "fsPromises.watch",
        "the filesystem WIT protocol does not model watcher resources",
      );
    },

    async writeFile(
      file: PathLike | number,
      data: FileData,
      options?: BufferEncoding | FlagOptions | null,
    ): Promise<void> {
      core.writeFileSync(file, data, options);
    },
  };
}

export type FsPromises = ReturnType<typeof createFsPromises>;
