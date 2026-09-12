/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/provider.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed contracts, shared constants/errors, explicit watcher refusals.
 */
import type { Buffer } from "./types.js";
import { R_OK, W_OK, X_OK, COPYFILE_EXCL } from "../../24.x.x/fs/constants.js";
import {
  createEROFS,
  createEEXIST,
  createEACCES,
  ERR_METHOD_NOT_IMPLEMENTED,
  unsupported,
} from "./errors.js";
import type { VirtualFileHandle } from "./file-handle.js";
import type {
  Time,
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  DirectoryOptions,
  DirectoryEntries,
  MkdirOptions,
} from "./types.js";

export class VirtualProvider {
  // === CAPABILITY FLAGS ===

  get readonly(): boolean {
    return false;
  }

  get supportsSymlinks(): boolean {
    return false;
  }

  get supportsWatch(): boolean {
    return false;
  }

  // === ESSENTIAL PRIMITIVES (must be implemented by subclasses) ===

  async open(
    _path: string,
    _flags: string | number = "r",
    _mode?: number,
  ): Promise<VirtualFileHandle> {
    throw new ERR_METHOD_NOT_IMPLEMENTED("open");
  }

  openSync(_path: string, _flags: string | number = "r", _mode?: number): VirtualFileHandle {
    throw new ERR_METHOD_NOT_IMPLEMENTED("openSync");
  }

  async stat(_path: string, _options?: StatOptions): Promise<FileStats> {
    throw new ERR_METHOD_NOT_IMPLEMENTED("stat");
  }

  statSync(_path: string, _options?: StatOptions): FileStats {
    throw new ERR_METHOD_NOT_IMPLEMENTED("statSync");
  }

  async lstat(path: string, options?: StatOptions): Promise<FileStats> {
    // Default: same as stat (for providers that don't support symlinks)
    return this.stat(path, options);
  }

  lstatSync(path: string, options?: StatOptions): FileStats {
    // Default: same as statSync (for providers that don't support symlinks)
    return this.statSync(path, options);
  }

  async readdir(_path: string, _options?: DirectoryOptions): Promise<DirectoryEntries> {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readdir");
  }

  readdirSync(_path: string, _options?: DirectoryOptions): DirectoryEntries {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readdirSync");
  }

  async mkdir(path: string, _options?: MkdirOptions): Promise<string | undefined> {
    if (this.readonly) {
      throw createEROFS("mkdir", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("mkdir");
  }

  mkdirSync(path: string, _options?: MkdirOptions): string | undefined {
    if (this.readonly) {
      throw createEROFS("mkdir", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("mkdirSync");
  }

  async rmdir(path: string): Promise<void> {
    if (this.readonly) {
      throw createEROFS("rmdir", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("rmdir");
  }

  rmdirSync(path: string): void {
    if (this.readonly) {
      throw createEROFS("rmdir", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("rmdirSync");
  }

  async unlink(path: string): Promise<void> {
    if (this.readonly) {
      throw createEROFS("unlink", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("unlink");
  }

  unlinkSync(path: string): void {
    if (this.readonly) {
      throw createEROFS("unlink", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("unlinkSync");
  }

  async rename(oldPath: string, _newPath: string): Promise<void> {
    if (this.readonly) {
      throw createEROFS("rename", oldPath);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("rename");
  }

  renameSync(oldPath: string, _newPath: string): void {
    if (this.readonly) {
      throw createEROFS("rename", oldPath);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("renameSync");
  }

  lchownSync(path: string, uid: number, gid: number): void {
    return this.chownSync(path, uid, gid);
  }

  // === DEFAULT IMPLEMENTATIONS (built on primitives) ===

  async readFile(path: string, options?: ReadFileOptions): Promise<Buffer | string> {
    const flag = typeof options === "object" && options !== null ? (options.flag ?? "r") : "r";

    const handle = await this.open(path, flag);
    try {
      return await handle.readFile(options);
    } finally {
      await handle.close();
    }
  }

  readFileSync(path: string, options?: ReadFileOptions): Buffer | string {
    const flag = typeof options === "object" && options !== null ? (options.flag ?? "r") : "r";

    const handle = this.openSync(path, flag);
    try {
      return handle.readFileSync(options);
    } finally {
      handle.closeSync();
    }
  }

  async writeFile(path: string, data: FileData, options?: FileOptions): Promise<void> {
    if (this.readonly) {
      throw createEROFS("open", path);
    }
    const flag = options?.flag ?? "w";

    const handle = await this.open(path, flag, options?.mode);
    try {
      await handle.writeFile(data, options);
    } finally {
      await handle.close();
    }
  }

  writeFileSync(path: string, data: FileData, options?: FileOptions): void {
    if (this.readonly) {
      throw createEROFS("open", path);
    }
    const flag = options?.flag ?? "w";

    const handle = this.openSync(path, flag, options?.mode);
    try {
      handle.writeFileSync(data, options);
    } finally {
      handle.closeSync();
    }
  }

  async appendFile(path: string, data: FileData, options?: FileOptions): Promise<void> {
    if (this.readonly) {
      throw createEROFS("open", path);
    }
    const flag = options?.flag ?? "a";

    const handle = await this.open(path, flag, options?.mode);
    try {
      await handle.writeFile(data, options);
    } finally {
      await handle.close();
    }
  }

  appendFileSync(path: string, data: FileData, options?: FileOptions): void {
    if (this.readonly) {
      throw createEROFS("open", path);
    }
    const flag = options?.flag ?? "a";

    const handle = this.openSync(path, flag, options?.mode);
    try {
      handle.writeFileSync(data, options);
    } finally {
      handle.closeSync();
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  existsSync(path: string): boolean {
    try {
      this.statSync(path);
      return true;
    } catch {
      return false;
    }
  }

  async copyFile(src: string, dest: string, mode: number = 0): Promise<void> {
    if (this.readonly) {
      throw createEROFS("copyfile", dest);
    }
    if ((mode & COPYFILE_EXCL) !== 0) {
      if (await this.exists(dest)) {
        throw createEEXIST("copyfile", dest);
      }
    }
    const content = await this.readFile(src);
    await this.writeFile(dest, content);
  }

  copyFileSync(src: string, dest: string, mode: number = 0): void {
    if (this.readonly) {
      throw createEROFS("copyfile", dest);
    }
    if ((mode & COPYFILE_EXCL) !== 0) {
      if (this.existsSync(dest)) {
        throw createEEXIST("copyfile", dest);
      }
    }
    const content = this.readFileSync(src);
    this.writeFileSync(dest, content);
  }

  async realpath(path: string, _options?: DirectoryOptions): Promise<string> {
    // Default: return the path as-is (for providers without symlinks)
    // First verify the path exists
    await this.stat(path);
    return path;
  }

  realpathSync(path: string, _options?: DirectoryOptions): string {
    // Default: return the path as-is (for providers without symlinks)
    // First verify the path exists
    this.statSync(path);
    return path;
  }

  async access(path: string, mode: number = 0): Promise<void> {
    const stats = await this.stat(path);
    this.#checkAccessMode(path, stats, mode);
  }

  accessSync(path: string, mode: number = 0): void {
    const stats = this.statSync(path);
    this.#checkAccessMode(path, stats, mode);
  }

  #checkAccessMode(path: string, stats: FileStats, mode?: number): void {
    if (mode == null || mode === 0) {
      return;
    } // F_OK = 0, existence-only check

    const fileMode = Number(stats.mode) & 0o777; // Permission bits
    // Check owner permissions (simplified: treat VFS user as owner)
    if ((mode & R_OK) !== 0 && (fileMode & 0o400) === 0) {
      throw createEACCES("access", path);
    }
    if ((mode & W_OK) !== 0 && (fileMode & 0o200) === 0) {
      throw createEACCES("access", path);
    }
    if ((mode & X_OK) !== 0 && (fileMode & 0o100) === 0) {
      throw createEACCES("access", path);
    }
  }

  // === HARD LINK OPERATIONS (optional) ===

  async link(existingPath: string, newPath: string): Promise<void> {
    if (this.readonly) {
      throw createEROFS("link", newPath);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("link");
  }

  linkSync(existingPath: string, newPath: string): void {
    if (this.readonly) {
      throw createEROFS("link", newPath);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("linkSync");
  }

  // === SYMLINK OPERATIONS (optional, throw ENOENT by default) ===

  async readlink(_path: string, _options?: DirectoryOptions): Promise<string | Buffer> {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readlink");
  }

  readlinkSync(_path: string, _options?: DirectoryOptions): string | Buffer {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readlinkSync");
  }

  async symlink(target: string, path: string, _type?: string): Promise<void> {
    if (this.readonly) {
      throw createEROFS("symlink", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("symlink");
  }

  symlinkSync(target: string, path: string, _type?: string): void {
    if (this.readonly) {
      throw createEROFS("symlink", path);
    }
    throw new ERR_METHOD_NOT_IMPLEMENTED("symlinkSync");
  }

  // === WATCH OPERATIONS (optional, polling-based) ===

  watch(..._args: unknown[]): never {
    return unsupported("VirtualProvider.watch");
  }

  watchAsync(..._args: unknown[]): never {
    return unsupported("VirtualProvider.watchAsync");
  }

  watchFile(..._args: unknown[]): never {
    return unsupported("VirtualProvider.watchFile");
  }

  unwatchFile(..._args: unknown[]): never {
    return unsupported("VirtualProvider.unwatchFile");
  }

  lutimesSync(_path: string, _atime: Time, _mtime: Time): void {
    throw new ERR_METHOD_NOT_IMPLEMENTED("lutimesSync");
  }

  utimesSync(_path: string, _atime: Time, _mtime: Time): void {
    throw new ERR_METHOD_NOT_IMPLEMENTED("utimesSync");
  }

  chownSync(_path: string, _uid: number, _gid: number): void {
    throw new ERR_METHOD_NOT_IMPLEMENTED("chownSync");
  }

  lchmodSync(_path: string, _mode: number): void {
    throw new ERR_METHOD_NOT_IMPLEMENTED("lchmodSync");
  }

  chmodSync(_path: string, _mode: number): void {
    throw new ERR_METHOD_NOT_IMPLEMENTED("chmodSync");
  }
}
