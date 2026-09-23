/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/providers/real.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Reuse the portable FsCore over injected hosts; paths are POSIX and roots absolute.
 */
import { Buffer as NodeBuffer } from "node:buffer";
import type { Buffer } from "./types.js";
import { FsCore } from "../../24.x.x/fs/core.js";
import { VirtualProvider } from "./provider.js";
import { VirtualFileHandle } from "./file-handle.js";
import { path } from "./path.js";
import { createENOENT, createEBADF } from "./errors.js";
import { hasCode } from "./validation.js";
import { invalidArgValue } from "../../24.x.x/errors/core.js";
import type {
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  DirectoryOptions,
  DirectoryEntries,
  MkdirOptions,
  Position,
  Time,
} from "./types.js";

class RealFileHandle extends VirtualFileHandle {
  readonly #core: FsCore;

  readonly #fd: number;

  constructor(core: FsCore, filePath: string, flags: string | number, mode?: number) {
    super(filePath, String(flags), mode);
    this.#core = core;
    this.#fd = core.openSync(filePath, flags, mode);
  }

  #checkOpen(syscall: string): void {
    if (this.closed) {
      throw createEBADF(syscall);
    }
  }

  readSync(buffer: Buffer, offset: number, length: number, position?: Position): number {
    this.#checkOpen("read");
    return this.#core.readSync(this.#fd, buffer, offset, length, position);
  }

  async read(
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): Promise<{ bytesRead: number; buffer: Buffer }> {
    return { bytesRead: this.readSync(buffer, offset, length, position), buffer };
  }

  writeSync(buffer: Buffer, offset: number, length: number, position?: Position): number {
    this.#checkOpen("write");
    return this.#core.writeSync(
      this.#fd,
      buffer,
      offset,
      length,
      position == null ? position : Number(position),
    );
  }

  async write(
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): Promise<{ bytesWritten: number; buffer: Buffer }> {
    return { bytesWritten: this.writeSync(buffer, offset, length, position), buffer };
  }

  readFileSync(options?: ReadFileOptions): Buffer | string {
    this.#checkOpen("read");
    const value = this.#core.readFileSync(this.#fd, options);
    return typeof value === "string" ? value : NodeBuffer.from(value);
  }

  async readFile(options?: ReadFileOptions): Promise<Buffer | string> {
    return this.readFileSync(options);
  }

  writeFileSync(data: FileData, options?: FileOptions): void {
    this.#checkOpen("write");
    this.#core.writeFileSync(this.#fd, data, options);
  }

  async writeFile(data: FileData, options?: FileOptions): Promise<void> {
    this.writeFileSync(data, options);
  }

  statSync(options?: StatOptions): FileStats {
    this.#checkOpen("fstat");
    return this.#core.fstatSync(this.#fd, options);
  }

  async stat(options?: StatOptions): Promise<FileStats> {
    return this.statSync(options);
  }

  truncateSync(len = 0): void {
    this.#checkOpen("ftruncate");
    this.#core.ftruncateSync(this.#fd, len);
  }

  async truncate(len = 0): Promise<void> {
    this.truncateSync(len);
  }

  closeSync(): void {
    if (this.closed) {
      return;
    }
    this.#core.closeSync(this.#fd);
    super.closeSync();
  }

  async close(): Promise<void> {
    this.closeSync();
  }
}

/** Bind each provider root to a host implementation without granting authority at import time. */
export interface RealProvider extends VirtualProvider {
  readonly rootPath: string;
}

export type RealProviderConstructor = new (rootPath: string) => RealProvider;

export function createRealFSProvider(
  createCore: (rootPath: string) => FsCore,
): RealProviderConstructor {
  return class RealFSProvider extends VirtualProvider {
    readonly #hostPath: typeof path;

    readonly #rootPath: string;

    #coreValue: FsCore | undefined;

    #canonicalRootValue: string | undefined;

    constructor(rootPath: string) {
      super();
      if (typeof rootPath !== "string") {
        throw invalidArgValue("rootPath", rootPath, "must be an absolute path");
      }
      this.#hostPath = path.isAbsolute(rootPath) ? path : path.win32;
      if (!this.#hostPath.isAbsolute(rootPath)) {
        throw invalidArgValue("rootPath", rootPath, "must be an absolute path");
      }
      this.#rootPath = this.#hostPath.normalize(rootPath);
      Object.defineProperties(this, {
        readonly: { value: false, enumerable: true, writable: true, configurable: true },
        supportsSymlinks: { value: true, enumerable: true, writable: true, configurable: true },
      });
    }

    get rootPath(): string {
      return this.#rootPath;
    }

    get #core(): FsCore {
      return (this.#coreValue ??= createCore(this.#rootPath));
    }

    get #canonicalRoot(): string {
      // Resolve lazily so construction does not require a filesystem capability.
      // Host aliases such as macOS /var must be compared in the same form as realpath results.
      return (this.#canonicalRootValue ??= String(this.#core.realpathSync(this.#rootPath)));
    }

    #inside(candidate: string, root = this.#rootPath): boolean {
      const separator = this.#hostPath.sep;
      const comparable = (value: string) =>
        this.#hostPath === path.win32 ? value.toLowerCase() : value;
      const normalizedCandidate = comparable(this.#hostPath.normalize(candidate));
      const normalizedRoot = comparable(this.#hostPath.normalize(root));
      const prefix = normalizedRoot.endsWith(separator)
        ? normalizedRoot
        : normalizedRoot + separator;
      return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(prefix);
    }

    #resolve(vfsPath: string, followFinal = true): string {
      const relative = vfsPath.startsWith("/") ? vfsPath.slice(1) : vfsPath;

      const candidate = this.#hostPath.resolve(this.#rootPath, relative);
      if (!this.#inside(candidate)) {
        throw createENOENT("open", vfsPath);
      }

      // Check the deepest existing ancestor as well as the lexical path. Keep
      // policy failures outside the ENOENT catch so an escaping link is rejected.
      let current = followFinal ? candidate : this.#hostPath.dirname(candidate);
      while (this.#inside(current)) {
        let resolved: string;
        try {
          resolved = String(this.#core.realpathSync(current));
        } catch (error) {
          if (!hasCode(error, "ENOENT")) {
            throw error;
          }
          const parent = this.#hostPath.dirname(current);
          if (parent === current) {
            break;
          }
          current = parent;
          continue;
        }
        if (!this.#inside(resolved, this.#canonicalRoot)) {
          throw createENOENT("open", vfsPath);
        }
        return candidate;
      }
      return candidate;
    }

    #virtual(realPath: string): string {
      // readlink may retain the supplied root spelling; realpath returns its canonical spelling.
      const root = this.#inside(realPath) ? this.#rootPath : this.#canonicalRoot;
      if (!this.#inside(realPath, root)) {
        throw createENOENT("realpath", realPath);
      }
      const relative = this.#hostPath.relative(root, realPath);
      return "/" + (this.#hostPath === path.win32 ? relative.replaceAll("\\", "/") : relative);
    }

    openSync(vfsPath: string, flags: string | number = "r", mode?: number): VirtualFileHandle {
      return new RealFileHandle(this.#core, this.#resolve(vfsPath), flags, mode);
    }

    async open(
      vfsPath: string,
      flags: string | number = "r",
      mode?: number,
    ): Promise<VirtualFileHandle> {
      return this.openSync(vfsPath, flags, mode);
    }

    statSync(vfsPath: string, options?: StatOptions): FileStats {
      return this.#core.statSync(this.#resolve(vfsPath), options)!;
    }

    async stat(vfsPath: string, options?: StatOptions): Promise<FileStats> {
      return this.statSync(vfsPath, options);
    }

    lstatSync(vfsPath: string, options?: StatOptions): FileStats {
      return this.#core.lstatSync(this.#resolve(vfsPath, false), options)!;
    }

    async lstat(vfsPath: string, options?: StatOptions): Promise<FileStats> {
      return this.lstatSync(vfsPath, options);
    }

    readdirSync(vfsPath: string, options?: DirectoryOptions): DirectoryEntries {
      return this.#core.readdirSync(this.#resolve(vfsPath), options) as DirectoryEntries;
    }

    async readdir(vfsPath: string, options?: DirectoryOptions): Promise<DirectoryEntries> {
      return this.readdirSync(vfsPath, options);
    }

    mkdirSync(vfsPath: string, options?: MkdirOptions): string | undefined {
      return this.#core.mkdirSync(this.#resolve(vfsPath), options);
    }

    async mkdir(vfsPath: string, options?: MkdirOptions): Promise<string | undefined> {
      return this.mkdirSync(vfsPath, options);
    }

    rmdirSync(vfsPath: string): void {
      return this.#core.rmdirSync(this.#resolve(vfsPath, false));
    }

    async rmdir(vfsPath: string): Promise<void> {
      return this.rmdirSync(vfsPath);
    }

    unlinkSync(vfsPath: string): void {
      return this.#core.unlinkSync(this.#resolve(vfsPath, false));
    }

    async unlink(vfsPath: string): Promise<void> {
      return this.unlinkSync(vfsPath);
    }

    renameSync(oldPath: string, newPath: string): void {
      return this.#core.renameSync(this.#resolve(oldPath, false), this.#resolve(newPath, false));
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
      return this.renameSync(oldPath, newPath);
    }

    linkSync(oldPath: string, newPath: string): void {
      return this.#core.linkSync(this.#resolve(oldPath, false), this.#resolve(newPath, false));
    }

    async link(oldPath: string, newPath: string): Promise<void> {
      return this.linkSync(oldPath, newPath);
    }

    realpathSync(vfsPath: string, _options?: DirectoryOptions): string {
      return this.#virtual(String(this.#core.realpathSync(this.#resolve(vfsPath))));
    }

    async realpath(vfsPath: string, options?: DirectoryOptions): Promise<string> {
      return this.realpathSync(vfsPath, options);
    }

    accessSync(vfsPath: string, mode = 0): void {
      return this.#core.accessSync(this.#resolve(vfsPath), mode);
    }

    async access(vfsPath: string, mode = 0): Promise<void> {
      return this.accessSync(vfsPath, mode);
    }

    copyFileSync(source: string, destination: string, mode = 0): void {
      return this.#core.copyFileSync(this.#resolve(source), this.#resolve(destination), mode);
    }

    async copyFile(source: string, destination: string, mode = 0): Promise<void> {
      return this.copyFileSync(source, destination, mode);
    }

    readlinkSync(vfsPath: string, options?: DirectoryOptions): string | Buffer {
      const target = String(this.#core.readlinkSync(this.#resolve(vfsPath, false)));

      const result = this.#hostPath.isAbsolute(target)
        ? this.#virtual(target)
        : this.#hostPath === path.win32
          ? target.replaceAll("\\", "/")
          : target;
      return options?.encoding === "buffer" ? NodeBuffer.from(result) : result;
    }

    async readlink(vfsPath: string, options?: DirectoryOptions): Promise<string | Buffer> {
      return this.readlinkSync(vfsPath, options);
    }

    symlinkSync(target: string, vfsPath: string, type?: string): void {
      const destination = this.#resolve(vfsPath, false);

      const realTarget = path.isAbsolute(target)
        ? this.#resolve(target)
        : this.#hostPath.normalize(target);
      if (type !== undefined && type !== "file" && type !== "dir" && type !== "junction") {
        throw invalidArgValue("type", type);
      }
      this.#core.symlinkSync(realTarget, destination, type);
    }

    async symlink(target: string, vfsPath: string, type?: string): Promise<void> {
      this.symlinkSync(target, vfsPath, type);
    }

    chmodSync(vfsPath: string, mode: number): void {
      this.#core.chmodSync(this.#resolve(vfsPath, true), mode);
    }

    chownSync(vfsPath: string, uid: number, gid: number): void {
      this.#core.chownSync(this.#resolve(vfsPath, true), uid, gid);
    }

    lchownSync(vfsPath: string, uid: number, gid: number): void {
      this.#core.lchownSync(this.#resolve(vfsPath, false), uid, gid);
    }

    utimesSync(vfsPath: string, atime: Time, mtime: Time): void {
      this.#core.utimesSync(this.#resolve(vfsPath, true), atime, mtime);
    }

    lutimesSync(vfsPath: string, atime: Time, mtime: Time): void {
      this.#core.lutimesSync(this.#resolve(vfsPath, false), atime, mtime);
    }
  };
}
