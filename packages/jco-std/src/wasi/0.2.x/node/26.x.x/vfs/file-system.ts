/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/file_system.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed facade, portable paths/Dir; native mount, stream and watcher operations fail explicitly.
 */
import { createVfsPromises, type VfsPromises } from "./promises.js";
import { invokeCallback, deferCallback, hasCode } from "./validation.js";
import type { Buffer } from "./types.js";
import { path as pathPosix } from "./path.js";
import { Dir, Dirent } from "../../24.x.x/fs/classes.js";
import { invalidArgType } from "../../24.x.x/errors/core.js";
import { VirtualProvider } from "./provider.js";
import { MemoryProvider } from "./memory.js";
import { openVirtualFd, getVirtualFd, closeVirtualFd } from "./fd.js";
import { createENOENT, createEBADF, createEISDIR, unsupported } from "./errors.js";
import type {
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  DirectoryOptions,
  DirectoryEntries,
  MkdirOptions,
  RemoveOptions,
  VfsOptions,
  Position,
  Time,
  Callback,
} from "./types.js";

const path = pathPosix;

const { isAbsolute, resolve: resolvePath, join: joinPath } = pathPosix;

const MathRandom = Math.random;

const isUnderMountPoint = (value: string, root: string): boolean =>
  value === root || value.startsWith(root + "/");
const getRelativePath = (value: string, root: string): string => value.slice(root.length) || "/";

export class VirtualFileSystem {
  #providerValue: VirtualProvider;

  #mountPointValue: string | null;

  #mountedValue: boolean;

  #promisesValue: VfsPromises | null;

  constructor(providerOrOptions?: VirtualProvider | VfsOptions | null, options: VfsOptions = {}) {
    const provider =
      providerOrOptions &&
      "openSync" in providerOrOptions &&
      typeof providerOrOptions.openSync === "function"
        ? (providerOrOptions as VirtualProvider)
        : undefined;
    if (providerOrOptions && !provider) {
      options = providerOrOptions as VfsOptions;
    }
    if (
      options.emitExperimentalWarning !== undefined &&
      typeof options.emitExperimentalWarning !== "boolean"
    ) {
      throw invalidArgType(
        "options.emitExperimentalWarning",
        "boolean",
        options.emitExperimentalWarning,
      );
    }
    this.#providerValue = provider ?? new MemoryProvider();
    this.#mountPointValue = null;
    this.#mountedValue = false;
    this.#promisesValue = null;
  }

  get provider(): VirtualProvider {
    return this.#providerValue;
  }

  get mountPoint(): string | null {
    return this.#mountPointValue;
  }

  get mounted(): boolean {
    return this.#mountedValue;
  }

  get readonly(): boolean {
    return this.#providerValue.readonly;
  }

  // ==================== Mount ====================

  mount(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.mount");
  }

  unmount(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.unmount");
  }

  [Symbol.dispose](): void {
    if (this.#mountedValue) {
      this.unmount();
    }
  }

  shouldHandle(inputPath: string): boolean {
    if (!this.#mountedValue || !this.#mountPointValue) {
      return false;
    }
    const normalized = isAbsolute(inputPath) ? inputPath : resolvePath(inputPath);
    return isUnderMountPoint(normalized, this.#mountPointValue);
  }

  // ==================== Path Resolution ====================

  #toProviderPath(inputPath: string): string {
    if (this.#mountedValue && this.#mountPointValue) {
      const resolved = isAbsolute(inputPath) ? inputPath : resolvePath(inputPath);
      if (!isUnderMountPoint(resolved, this.#mountPointValue)) {
        throw createENOENT("open", inputPath);
      }
      return getRelativePath(resolved, this.#mountPointValue);
    }
    return pathPosix.normalize(inputPath);
  }

  #toMountedPath(providerPath: string): string {
    if (this.#mountedValue && this.#mountPointValue) {
      return path.join(this.#mountPointValue, providerPath);
    }
    return providerPath;
  }

  // ==================== FS Operations (Sync) ====================

  existsSync(filePath: string): boolean {
    try {
      const providerPath = this.#toProviderPath(filePath);
      return this.#providerValue.existsSync(providerPath);
    } catch {
      return false;
    }
  }

  statSync(filePath: string, options?: StatOptions): FileStats {
    const providerPath = this.#toProviderPath(filePath);
    return this.#providerValue.statSync(providerPath, options);
  }

  lstatSync(filePath: string, options?: StatOptions): FileStats {
    const providerPath = this.#toProviderPath(filePath);
    return this.#providerValue.lstatSync(providerPath, options);
  }

  readFileSync(filePath: string, options?: ReadFileOptions): Buffer | string {
    const providerPath = this.#toProviderPath(filePath);
    return this.#providerValue.readFileSync(providerPath, options);
  }

  writeFileSync(filePath: string, data: FileData, options?: FileOptions): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.writeFileSync(providerPath, data, options);
  }

  appendFileSync(filePath: string, data: FileData, options?: FileOptions): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.appendFileSync(providerPath, data, options);
  }

  readdirSync(dirPath: string, options?: DirectoryOptions): DirectoryEntries {
    const providerPath = this.#toProviderPath(dirPath);

    const result = this.#providerValue.readdirSync(providerPath, options);

    // Fix Dirent parentPath from provider-relative to actual VFS path
    if (options?.withFileTypes === true) {
      const recursive = options?.recursive === true;
      for (let i = 0; i < result.length; i++) {
        const dirent = result[i] as Dirent<string>;
        if (recursive) {
          // In recursive mode, name may contain slashes (e.g. 'a/b.txt').
          // Fix to basename only and set correct parentPath.
          const slashIdx = dirent.name.lastIndexOf("/");
          if (slashIdx !== -1) {
            const subdir = dirent.name.slice(0, slashIdx);
            result[i] = new Dirent(
              dirent.name.slice(slashIdx + 1),
              joinPath(dirPath, subdir),
              dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "symlink" : "file",
            );
          } else {
            result[i] = new Dirent(
              dirent.name,
              dirPath,
              dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "symlink" : "file",
            );
          }
        } else {
          result[i] = new Dirent(
            dirent.name,
            dirPath,
            dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "symlink" : "file",
          );
        }
      }
    }

    return result;
  }

  mkdirSync(dirPath: string, options?: MkdirOptions): string | undefined {
    const providerPath = this.#toProviderPath(dirPath);
    return this.#providerValue.mkdirSync(providerPath, options);
  }

  rmdirSync(dirPath: string): void {
    const providerPath = this.#toProviderPath(dirPath);
    this.#providerValue.rmdirSync(providerPath);
  }

  unlinkSync(filePath: string): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.unlinkSync(providerPath);
  }

  renameSync(oldPath: string, newPath: string): void {
    const oldProviderPath = this.#toProviderPath(oldPath);

    const newProviderPath = this.#toProviderPath(newPath);
    this.#providerValue.renameSync(oldProviderPath, newProviderPath);
  }

  copyFileSync(src: string, dest: string, mode?: number): void {
    const srcProviderPath = this.#toProviderPath(src);

    const destProviderPath = this.#toProviderPath(dest);
    this.#providerValue.copyFileSync(srcProviderPath, destProviderPath, mode);
  }

  realpathSync(filePath: string, options?: DirectoryOptions): string {
    const providerPath = this.#toProviderPath(filePath);

    const realProviderPath = this.#providerValue.realpathSync(providerPath, options);
    return this.#toMountedPath(realProviderPath);
  }

  readlinkSync(linkPath: string, options?: DirectoryOptions): string | Buffer {
    const providerPath = this.#toProviderPath(linkPath);
    return this.#providerValue.readlinkSync(providerPath, options);
  }

  symlinkSync(target: string, path: string, type?: string): void {
    const providerPath = this.#toProviderPath(path);
    this.#providerValue.symlinkSync(target, providerPath, type);
  }

  accessSync(filePath: string, mode?: number): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.accessSync(providerPath, mode);
  }

  rmSync(filePath: string, options?: RemoveOptions): void {
    const recursive = options?.recursive === true;

    const force = options?.force === true;

    let stats;
    try {
      stats = this.lstatSync(filePath);
    } catch (err) {
      if (force && hasCode(err, "ENOENT")) {
        return;
      }
      throw err;
    }

    // Symlinks should be unlinked directly, never recursed into
    if (stats.isSymbolicLink()) {
      this.unlinkSync(filePath);
      return;
    }

    if (stats.isDirectory()) {
      if (!recursive) {
        throw createEISDIR("rm", filePath);
      }
      const entries = this.readdirSync(filePath);
      for (let i = 0; i < entries.length; i++) {
        this.rmSync(joinPath(filePath, String(entries[i])), options);
      }
      this.rmdirSync(filePath);
    } else {
      this.unlinkSync(filePath);
    }
  }

  // ==================== Additional Sync Operations ====================

  truncateSync(filePath: string, len: number = 0): void {
    if (len < 0) {
      len = 0;
    }
    const providerPath = this.#toProviderPath(filePath);

    const handle = this.#providerValue.openSync(providerPath, "r+");
    try {
      handle.truncateSync(len);
    } finally {
      handle.closeSync();
    }
  }

  ftruncateSync(fd: number, len: number = 0): void {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      throw createEBADF("ftruncate");
    }
    vfd.entry.truncateSync(len);
  }

  linkSync(existingPath: string, newPath: string): void {
    const existingProviderPath = this.#toProviderPath(existingPath);

    const newProviderPath = this.#toProviderPath(newPath);
    this.#providerValue.linkSync(existingProviderPath, newProviderPath);
  }

  chmodSync(filePath: string, mode?: number): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.chmodSync(providerPath, mode!);
  }

  chownSync(filePath: string, uid: number, gid: number): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.chownSync(providerPath, uid, gid);
  }

  lchownSync(filePath: string, uid: number, gid: number): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.lchownSync(providerPath, uid, gid);
  }

  utimesSync(filePath: string, atime: Time, mtime: Time): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.utimesSync(providerPath, atime, mtime);
  }

  lutimesSync(filePath: string, atime: Time, mtime: Time): void {
    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.lutimesSync(providerPath, atime, mtime);
  }

  mkdtempSync(prefix: string): string {
    const providerPrefix = this.#toProviderPath(prefix);
    // Generate random 6-character suffix like Node does
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars[(MathRandom() * chars.length) | 0];
    }
    const dirPath = providerPrefix + suffix;
    this.#providerValue.mkdirSync(dirPath);
    return this.#toMountedPath(dirPath);
  }

  opendirSync(dirPath: string, options?: DirectoryOptions): Dir {
    const entries = this.readdirSync(dirPath, {
      withFileTypes: true,
      recursive: options?.recursive,
    });
    return new Dir(dirPath, entries as Dirent<string>[]);
  }

  openAsBlob(filePath: string, options?: { type?: string }): Blob {
    const providerPath = this.#toProviderPath(filePath);

    const content = this.#providerValue.readFileSync(providerPath);

    const type = options?.type || "";
    return new Blob([typeof content === "string" ? content : new Uint8Array(content)], { type });
  }

  // ==================== File Descriptor Operations ====================

  openSync(filePath: string, flags: string | number = "r", mode?: number): number {
    const providerPath = this.#toProviderPath(filePath);

    const handle = this.#providerValue.openSync(providerPath, flags, mode);
    return openVirtualFd(handle);
  }

  closeSync(fd: number): void {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      throw createEBADF("close");
    }
    vfd.entry.closeSync();
    closeVirtualFd(fd);
  }

  readSync(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): number {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      throw createEBADF("read");
    }
    return vfd.entry.readSync(buffer, offset, length, position);
  }

  writeSync(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): number {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      throw createEBADF("write");
    }
    return vfd.entry.writeSync(buffer, offset, length, position);
  }

  fstatSync(fd: number, options?: StatOptions): FileStats {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      throw createEBADF("fstat");
    }
    return vfd.entry.statSync(options);
  }

  // ==================== FS Operations (Async with Callbacks) ====================

  readFile(
    filePath: string,
    options?: ReadFileOptions | Callback<Buffer | string>,
    callback?: Callback<Buffer | string>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.readFile(this.#toProviderPath(filePath), options).then(
      (data) => invokeCallback(callback, null, data),
      (err) => invokeCallback(callback, err),
    );
  }

  writeFile(
    filePath: string,
    data: FileData,
    options?: FileOptions | Callback<void>,
    callback?: Callback<void>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.writeFile(this.#toProviderPath(filePath), data, options).then(
      () => invokeCallback(callback, null),
      (err) => invokeCallback(callback, err),
    );
  }

  stat(
    filePath: string,
    options?: StatOptions | Callback<FileStats>,
    callback?: Callback<FileStats>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.stat(this.#toProviderPath(filePath), options).then(
      (stats) => invokeCallback(callback, null, stats),
      (err) => invokeCallback(callback, err),
    );
  }

  lstat(
    filePath: string,
    options?: StatOptions | Callback<FileStats>,
    callback?: Callback<FileStats>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.lstat(this.#toProviderPath(filePath), options).then(
      (stats) => invokeCallback(callback, null, stats),
      (err) => invokeCallback(callback, err),
    );
  }

  readdir(
    dirPath: string,
    options?: DirectoryOptions | Callback<DirectoryEntries>,
    callback?: Callback<DirectoryEntries>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.readdir(this.#toProviderPath(dirPath), options).then(
      (entries) => invokeCallback(callback, null, entries),
      (err) => invokeCallback(callback, err),
    );
  }

  realpath(
    filePath: string,
    options?: DirectoryOptions | Callback<string>,
    callback?: Callback<string>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.realpath(this.#toProviderPath(filePath), options).then(
      (realPath) => invokeCallback(callback, null, this.#toMountedPath(realPath)),
      (err) => invokeCallback(callback, err),
    );
  }

  readlink(
    linkPath: string,
    options?: DirectoryOptions | Callback<string | Buffer>,
    callback?: Callback<string | Buffer>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    this.#providerValue.readlink(this.#toProviderPath(linkPath), options).then(
      (target) => invokeCallback(callback, null, target),
      (err) => invokeCallback(callback, err),
    );
  }

  access(filePath: string, mode?: number | Callback<void>, callback?: Callback<void>): void {
    if (typeof mode === "function") {
      callback = mode;
      mode = undefined;
    }

    this.#providerValue.access(this.#toProviderPath(filePath), mode).then(
      () => invokeCallback(callback, null),
      (err) => invokeCallback(callback, err),
    );
  }

  open(
    filePath: string,
    flags?: string | number | Callback<number>,
    mode?: number | Callback<number>,
    callback?: Callback<number>,
  ): void {
    if (typeof flags === "function") {
      callback = flags;
      flags = "r";
      mode = undefined;
    } else if (typeof mode === "function") {
      callback = mode;
      mode = undefined;
    }

    const providerPath = this.#toProviderPath(filePath);
    this.#providerValue.open(providerPath, flags, mode).then(
      (handle) => {
        const fd = openVirtualFd(handle);
        invokeCallback(callback, null, fd);
      },
      (err) => invokeCallback(callback, err),
    );
  }

  close(fd: number, callback?: Callback<void>): void {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      deferCallback(callback, createEBADF("close"));
      return;
    }

    vfd.entry.close().then(
      () => {
        closeVirtualFd(fd);
        invokeCallback(callback, null);
      },
      (err) => invokeCallback(callback, err),
    );
  }

  read(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
    callback?: (error: Error | null, count?: number, buffer?: Buffer) => void,
  ): void {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      deferCallback(callback, createEBADF("read"));
      return;
    }

    vfd.entry.read(buffer, offset, length, position).then(
      ({ bytesRead }) => invokeCallback(callback, null, bytesRead, buffer),
      (err) => invokeCallback(callback, err),
    );
  }

  write(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
    callback?: (error: Error | null, count?: number, buffer?: Buffer) => void,
  ): void {
    const vfd = getVirtualFd(fd);
    if (!vfd) {
      deferCallback(callback, createEBADF("write"));
      return;
    }

    vfd.entry.write(buffer, offset, length, position).then(
      ({ bytesWritten }) => invokeCallback(callback, null, bytesWritten, buffer),
      (err) => invokeCallback(callback, err),
    );
  }

  rm(filePath: string, options?: RemoveOptions | Callback<void>, callback?: Callback<void>): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    try {
      this.rmSync(filePath, options);
      deferCallback(callback, null);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  fstat(
    fd: number,
    options?: StatOptions | Callback<FileStats>,
    callback?: Callback<FileStats>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    const vfd = getVirtualFd(fd);
    if (!vfd) {
      deferCallback(callback, createEBADF("fstat"));
      return;
    }

    vfd.entry.stat(options).then(
      (stats) => invokeCallback(callback, null, stats),
      (err) => invokeCallback(callback, err),
    );
  }

  truncate(filePath: string, len?: number | Callback<void>, callback?: Callback<void>): void {
    if (typeof len === "function") {
      callback = len;
      len = 0;
    }
    try {
      this.truncateSync(filePath, len);
      deferCallback(callback, null);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  ftruncate(fd: number, len?: number | Callback<void>, callback?: Callback<void>): void {
    if (typeof len === "function") {
      callback = len;
      len = 0;
    }
    try {
      this.ftruncateSync(fd, len);
      deferCallback(callback, null);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  link(existingPath: string, newPath: string, callback?: Callback<void>): void {
    try {
      this.linkSync(existingPath, newPath);
      deferCallback(callback, null);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  mkdtemp(
    prefix: string,
    options?: DirectoryOptions | Callback<string>,
    callback?: Callback<string>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    try {
      const dirPath = this.mkdtempSync(prefix);
      deferCallback(callback, null, dirPath);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  opendir(
    dirPath: string,
    options?: DirectoryOptions | Callback<Dir>,
    callback?: Callback<Dir>,
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    try {
      const dir = this.opendirSync(dirPath, options);
      deferCallback(callback, null, dir);
    } catch (err) {
      deferCallback(callback, err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ==================== Stream Operations ====================

  createReadStream(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.createReadStream");
  }

  createWriteStream(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.createWriteStream");
  }

  // ==================== Watch Operations ====================

  watch(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.watch");
  }

  watchFile(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.watchFile");
  }

  unwatchFile(..._args: unknown[]): never {
    return unsupported("VirtualFileSystem.unwatchFile");
  }

  // ==================== Promise API ====================

  get promises(): VfsPromises {
    if (this.#promisesValue === null) {
      this.#promisesValue = createVfsPromises(
        this.#providerValue,
        (path) => this.#toProviderPath(path),
        (path) => this.#toMountedPath(path),
      );
    }
    return this.#promisesValue;
  }
}
