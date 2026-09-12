/**
 * Promise namespace adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9,
 * lib/internal/vfs/file_system.js (MIT; see jco-std/LICENSE).
 * Kept separate from the sync/callback facade; both share one provider.
 */
import type { VirtualProvider } from "./provider.js";
import type {
  Buffer,
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  DirectoryOptions,
  DirectoryEntries,
  MkdirOptions,
  RemoveOptions,
  Time,
} from "./types.js";
import { openVirtualFd } from "./fd.js";
import { createEISDIR, unsupported } from "./errors.js";
import { hasCode } from "./validation.js";
import { path } from "./path.js";

const ObjectFreeze = Object.freeze;

const MathRandom = Math.random;

const joinPath = path.join;

export interface VfsPromises {
  readFile(path: string, options?: ReadFileOptions): Promise<Buffer | string>;
  writeFile(path: string, data: FileData, options?: FileOptions): Promise<void>;
  appendFile(path: string, data: FileData, options?: FileOptions): Promise<void>;
  stat(path: string, options?: StatOptions): Promise<FileStats>;
  lstat(path: string, options?: StatOptions): Promise<FileStats>;
  readdir(path: string, options?: DirectoryOptions): Promise<DirectoryEntries>;
  mkdir(path: string, options?: MkdirOptions): Promise<string | undefined>;
  rmdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dest: string, mode?: number): Promise<void>;
  realpath(path: string, options?: DirectoryOptions): Promise<string>;
  readlink(path: string, options?: DirectoryOptions): Promise<string | Buffer>;
  symlink(target: string, path: string, type?: string): Promise<void>;
  access(path: string, mode?: number): Promise<void>;
  rm(filePath: string, options?: RemoveOptions): Promise<void>;
  truncate(filePath: string, len?: number): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  chmod(path: string, mode: number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
  lchown(path: string, uid: number, gid: number): Promise<void>;
  utimes(path: string, atime: Time, mtime: Time): Promise<void>;
  lutimes(path: string, atime: Time, mtime: Time): Promise<void>;
  open(filePath: string, flags?: string | number, mode?: number): Promise<number>;
  lchmod(path: string, mode: number): Promise<void>;
  watch(...args: unknown[]): never;
}

export function createVfsPromises(
  provider: VirtualProvider,
  toProviderPath: (path: string) => string,
  toMountedPath: (path: string) => string,
): VfsPromises {
  return ObjectFreeze({
    async readFile(filePath: string, options?: ReadFileOptions): Promise<Buffer | string> {
      const providerPath = toProviderPath(filePath);
      return provider.readFile(providerPath, options);
    },

    async writeFile(filePath: string, data: FileData, options?: FileOptions): Promise<void> {
      const providerPath = toProviderPath(filePath);
      return provider.writeFile(providerPath, data, options);
    },

    async appendFile(filePath: string, data: FileData, options?: FileOptions): Promise<void> {
      const providerPath = toProviderPath(filePath);
      return provider.appendFile(providerPath, data, options);
    },

    async stat(filePath: string, options?: StatOptions): Promise<FileStats> {
      const providerPath = toProviderPath(filePath);
      return provider.stat(providerPath, options);
    },

    async lstat(filePath: string, options?: StatOptions): Promise<FileStats> {
      const providerPath = toProviderPath(filePath);
      return provider.lstat(providerPath, options);
    },

    async readdir(dirPath: string, options?: DirectoryOptions): Promise<DirectoryEntries> {
      const providerPath = toProviderPath(dirPath);
      return provider.readdir(providerPath, options);
    },

    async mkdir(dirPath: string, options?: MkdirOptions): Promise<string | undefined> {
      const providerPath = toProviderPath(dirPath);
      return provider.mkdir(providerPath, options);
    },

    async rmdir(dirPath: string): Promise<void> {
      const providerPath = toProviderPath(dirPath);
      return provider.rmdir(providerPath);
    },

    async unlink(filePath: string): Promise<void> {
      const providerPath = toProviderPath(filePath);
      return provider.unlink(providerPath);
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const oldProviderPath = toProviderPath(oldPath);

      const newProviderPath = toProviderPath(newPath);
      return provider.rename(oldProviderPath, newProviderPath);
    },

    async copyFile(src: string, dest: string, mode?: number): Promise<void> {
      const srcProviderPath = toProviderPath(src);

      const destProviderPath = toProviderPath(dest);
      return provider.copyFile(srcProviderPath, destProviderPath, mode);
    },

    async realpath(filePath: string, options?: DirectoryOptions): Promise<string> {
      const providerPath = toProviderPath(filePath);
      return toMountedPath(await provider.realpath(providerPath, options));
    },

    async readlink(linkPath: string, options?: DirectoryOptions): Promise<string | Buffer> {
      const providerPath = toProviderPath(linkPath);
      return provider.readlink(providerPath, options);
    },

    async symlink(target: string, path: string, type?: string): Promise<void> {
      const providerPath = toProviderPath(path);
      return provider.symlink(target, providerPath, type);
    },

    async access(filePath: string, mode?: number): Promise<void> {
      const providerPath = toProviderPath(filePath);
      return provider.access(providerPath, mode);
    },

    async rm(filePath: string, options?: RemoveOptions): Promise<void> {
      const recursive = options?.recursive === true;

      const force = options?.force === true;

      let stats;
      try {
        stats = await provider.lstat(toProviderPath(filePath));
      } catch (err) {
        if (force && hasCode(err, "ENOENT")) {
          return;
        }
        throw err;
      }

      // Symlinks should be unlinked directly, never recursed into
      if (stats.isSymbolicLink()) {
        await provider.unlink(toProviderPath(filePath));
        return;
      }

      if (stats.isDirectory()) {
        if (!recursive) {
          throw createEISDIR("rm", filePath);
        }
        const entries = await provider.readdir(toProviderPath(filePath));
        for (let i = 0; i < entries.length; i++) {
          await this.rm(joinPath(filePath, String(entries[i])), options);
        }
        await provider.rmdir(toProviderPath(filePath));
      } else {
        await provider.unlink(toProviderPath(filePath));
      }
    },

    async truncate(filePath: string, len: number = 0): Promise<void> {
      const providerPath = toProviderPath(filePath);

      const handle = await provider.open(providerPath, "r+");
      try {
        await handle.truncate(len);
      } finally {
        await handle.close();
      }
    },

    async link(existingPath: string, newPath: string): Promise<void> {
      const existingProviderPath = toProviderPath(existingPath);

      const newProviderPath = toProviderPath(newPath);
      return provider.link(existingProviderPath, newProviderPath);
    },

    async mkdtemp(prefix: string): Promise<string> {
      const providerPrefix = toProviderPath(prefix);

      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

      let suffix = "";
      for (let i = 0; i < 6; i++) {
        suffix += chars[(MathRandom() * chars.length) | 0];
      }
      const dirPath = providerPrefix + suffix;
      await provider.mkdir(dirPath);
      return toMountedPath(dirPath);
    },

    async chmod(filePath: string, mode?: number): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.chmodSync(providerPath, mode!);
    },

    async chown(filePath: string, uid: number, gid: number): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.chownSync(providerPath, uid, gid);
    },

    async lchown(filePath: string, uid: number, gid: number): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.lchownSync(providerPath, uid, gid);
    },

    async utimes(filePath: string, atime: Time, mtime: Time): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.utimesSync(providerPath, atime, mtime);
    },

    async lutimes(filePath: string, atime: Time, mtime: Time): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.lutimesSync(providerPath, atime, mtime);
    },

    async open(filePath: string, flags?: string | number, mode?: number): Promise<number> {
      const providerPath = toProviderPath(filePath);

      const handle = provider.openSync(providerPath, flags, mode);
      return openVirtualFd(handle);
    },

    async lchmod(filePath: string, mode?: number): Promise<void> {
      const providerPath = toProviderPath(filePath);
      provider.lchmodSync(providerPath, mode!);
    },

    watch(..._args: unknown[]): never {
      return unsupported("promises.watch");
    },
  });
}
