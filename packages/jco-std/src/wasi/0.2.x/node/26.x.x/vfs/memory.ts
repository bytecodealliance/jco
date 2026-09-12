/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/providers/memory.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed tree and existing value objects; no native watcher or inaccessible lazy-population hooks.
 */
import { hasCode } from "./validation.js";
import { Buffer as NodeBuffer } from "node:buffer";
import type { Buffer } from "./types.js";
import { path as pathPosix } from "./path.js";
import { Dirent } from "../../24.x.x/fs/classes.js";
import { O_APPEND, O_CREAT, O_EXCL, O_RDWR, O_TRUNC, O_WRONLY } from "../../24.x.x/fs/constants.js";
import { VirtualProvider } from "./provider.js";
import { VirtualFileHandle, MemoryFileHandle } from "./file-handle.js";
import { createFileStats, createDirectoryStats, createSymlinkStats } from "./stats.js";
import {
  createENOENT,
  createENOTDIR,
  createENOTEMPTY,
  createEISDIR,
  createEEXIST,
  createEINVAL,
  createELOOP,
  createEROFS,
  ERR_INVALID_STATE,
  unsupported,
} from "./errors.js";
import type {
  FileStats,
  DirectoryOptions,
  DirectoryEntries,
  MkdirOptions,
  StatOptions,
  Time,
} from "./types.js";

const DateNow = Date.now;

const isPromise = (value: unknown): value is Promise<unknown> => value instanceof Promise;

const startsWith = (value: string, prefix: string): boolean => value.startsWith(prefix);

const UV_DIRENT_FILE = "file";

const UV_DIRENT_DIR = "directory";

const UV_DIRENT_LINK = "symlink";

function normalizeFlags(flags: string | number): string {
  if (typeof flags === "string") {
    return flags;
  }
  if (typeof flags !== "number") {
    return "r";
  }

  const rdwr = (flags & O_RDWR) !== 0;

  const append = (flags & O_APPEND) !== 0;

  const excl = (flags & O_EXCL) !== 0;

  const write = (flags & O_WRONLY) !== 0 || (flags & O_CREAT) !== 0 || (flags & O_TRUNC) !== 0;

  if (append) {
    return "a" + (excl ? "x" : "") + (rdwr ? "+" : "");
  }
  if (write) {
    return "w" + (excl ? "x" : "") + (rdwr ? "+" : "");
  }
  if (rdwr) {
    return "r+";
  }
  return "r";
}

/**
 * Converts a time argument (Date, number, or string) to milliseconds.
 * Numbers are treated as seconds (matching Node.js utimes convention).
 * @param {Date|number|string} time The time value
 * @returns {number} Milliseconds since epoch
 */
function toMs(time: Time): number {
  if (typeof time === "number") {
    return time * 1000;
  }
  if (typeof time === "string") {
    return DateNow();
  } // Fallback for string timestamps
  if (typeof time === "object" && time !== null) {
    return +time;
  }
  return time;
}

// Entry types
const TYPE_FILE = 0;

const TYPE_DIR = 1;

const TYPE_SYMLINK = 2;

// Maximum symlink resolution depth
const kMaxSymlinkDepth = 40;

/**
 * Internal entry representation for MemoryProvider.
 */
export class MemoryEntry {
  type: number;

  mode: number;

  content: Buffer;

  contentProvider: (() => string | Buffer | Promise<string | Buffer>) | null;

  target: string;

  children: Map<string, MemoryEntry>;

  nlink: number;

  uid: number;

  gid: number;

  atime: number;

  mtime: number;

  ctime: number;

  birthtime: number;

  constructor(type: number, options: MkdirOptions = {}) {
    this.type = type;
    this.mode = options.mode ?? (type === TYPE_DIR ? 0o755 : 0o644);
    this.content = NodeBuffer.alloc(0); // For files - static Buffer content
    this.contentProvider = null; // For files - dynamic content function
    this.target = ""; // For symlinks
    this.children = new Map(); // For directories
    this.nlink = 1;
    this.uid = 0;
    this.gid = 0;
    const now = DateNow();
    this.atime = now;
    this.mtime = now;
    this.ctime = now;
    this.birthtime = now;
  }

  getContentSync(): Buffer {
    if (this.contentProvider !== null) {
      const result = this.contentProvider();
      if (isPromise(result)) {
        // It's a Promise - can't use sync API
        throw new ERR_INVALID_STATE("cannot use sync API with async content provider");
      }
      return typeof result === "string" ? NodeBuffer.from(result) : result;
    }
    return this.content;
  }

  async getContentAsync(): Promise<Buffer> {
    if (this.contentProvider !== null) {
      const result = await this.contentProvider();
      return typeof result === "string" ? NodeBuffer.from(result) : result;
    }
    return this.content;
  }

  isDynamic(): boolean {
    return this.contentProvider !== null;
  }

  isFile(): boolean {
    return this.type === TYPE_FILE;
  }

  isDirectory(): boolean {
    return this.type === TYPE_DIR;
  }

  isSymbolicLink(): boolean {
    return this.type === TYPE_SYMLINK;
  }
}

/**
 * In-memory filesystem provider.
 * Supports full read/write operations.
 */
export class MemoryProvider extends VirtualProvider {
  #root: MemoryEntry;

  #readonly: boolean;

  constructor() {
    super();
    // Root directory
    this.#root = new MemoryEntry(TYPE_DIR);
    this.#root.children = new Map<string, MemoryEntry>();
    this.#readonly = false;
  }

  get readonly(): boolean {
    return this.#readonly;
  }

  get supportsWatch(): boolean {
    return false;
  }

  setReadOnly(): void {
    this.#readonly = true;
  }

  get supportsSymlinks(): boolean {
    return true;
  }

  #normalizePath(path: string): string {
    // Convert backslashes to forward slashes
    let normalized = path.replaceAll("\\", "/");
    // Ensure absolute path
    if (normalized[0] !== "/") {
      normalized = "/" + normalized;
    }
    // Use path.posix.normalize to resolve . and ..
    return pathPosix.normalize(normalized);
  }

  #splitPath(path: string): string[] {
    if (path === "/") {
      return [];
    }
    return path.slice(1).split("/");
  }

  #resolveSymlinkTarget(symlinkPath: string, target: string): string {
    if (target.startsWith("/")) {
      return this.#normalizePath(target);
    }
    // Relative target: resolve against symlink's parent directory
    const parentPath = pathPosix.dirname(symlinkPath);
    return this.#normalizePath(pathPosix.join(parentPath, target));
  }

  #lookupEntry(
    path: string,
    followSymlinks = true,
    depth = 0,
  ): { entry: MemoryEntry | null; resolvedPath: string | null; eloop?: boolean } {
    const normalized = this.#normalizePath(path);

    if (normalized === "/") {
      return { entry: this.#root, resolvedPath: "/" };
    }

    const segments = this.#splitPath(normalized);

    let current = this.#root;

    let currentPath = "/";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Always follow symlinks for intermediate path components
      if (current.isSymbolicLink()) {
        if (depth >= kMaxSymlinkDepth) {
          return { entry: null, resolvedPath: null, eloop: true };
        }
        const targetPath = this.#resolveSymlinkTarget(currentPath, current.target);

        const result = this.#lookupEntry(targetPath, true, depth + 1);
        if (result.eloop) {
          return result;
        }
        if (!result.entry) {
          return { entry: null, resolvedPath: null };
        }
        current = result.entry;
        currentPath = result.resolvedPath!;
      }

      if (!current.isDirectory()) {
        return { entry: null, resolvedPath: null };
      }

      const entry = current.children.get(segment);
      if (!entry) {
        return { entry: null, resolvedPath: null };
      }

      currentPath = pathPosix.join(currentPath, segment);
      current = entry;
    }

    // Follow symlink at the end if requested
    if (current.isSymbolicLink() && followSymlinks) {
      if (depth >= kMaxSymlinkDepth) {
        return { entry: null, resolvedPath: null, eloop: true };
      }
      const targetPath = this.#resolveSymlinkTarget(currentPath, current.target);
      return this.#lookupEntry(targetPath, true, depth + 1);
    }

    return { entry: current, resolvedPath: currentPath };
  }

  #getEntry(path: string, syscall: string, followSymlinks = true): MemoryEntry {
    const result = this.#lookupEntry(path, followSymlinks);
    if (result.eloop) {
      throw createELOOP(syscall, path);
    }
    if (!result.entry) {
      throw createENOENT(syscall, path);
    }
    return result.entry;
  }

  #ensureParent(path: string, create: boolean, syscall: string): MemoryEntry {
    if (path === "/") {
      return this.#root;
    }
    const parentPath = pathPosix.dirname(path);

    const segments = this.#splitPath(parentPath);

    let current = this.#root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      const currentPath = pathPosix.join("/", ...segments.slice(0, i));

      // Follow symlinks in parent path
      if (current.isSymbolicLink()) {
        const targetPath = this.#resolveSymlinkTarget(currentPath, current.target);

        const result = this.#lookupEntry(targetPath, true, 0);
        if (!result.entry) {
          throw createENOENT(syscall, path);
        }
        current = result.entry;
      }

      if (!current.isDirectory()) {
        throw createENOTDIR(syscall, path);
      }

      let entry = current.children.get(segment);
      if (!entry) {
        if (create) {
          entry = new MemoryEntry(TYPE_DIR);
          entry.children = new Map<string, MemoryEntry>();
          current.children.set(segment, entry);
        } else {
          throw createENOENT(syscall, path);
        }
      }
      current = entry;
    }

    // Follow symlinks on the final parent entry
    if (current.isSymbolicLink()) {
      const targetPath = this.#resolveSymlinkTarget(parentPath, current.target);

      const result = this.#lookupEntry(targetPath, true, 0);
      if (!result.entry) {
        throw createENOENT(syscall, path);
      }
      current = result.entry;
    }

    if (!current.isDirectory()) {
      throw createENOTDIR(syscall, path);
    }

    return current;
  }

  #createStats(entry: MemoryEntry, size?: number, bigint?: boolean): FileStats {
    const options = {
      mode: entry.mode,
      nlink: entry.nlink,
      uid: entry.uid,
      gid: entry.gid,
      atimeMs: entry.atime,
      mtimeMs: entry.mtime,
      ctimeMs: entry.ctime,
      birthtimeMs: entry.birthtime,
      bigint,
    };

    if (entry.isFile()) {
      let fileSize = size;
      if (fileSize === undefined) {
        fileSize = entry.isDynamic() ? entry.getContentSync().length : entry.content.length;
      }
      return createFileStats(fileSize, options);
    } else if (entry.isDirectory()) {
      return createDirectoryStats(options);
    } else if (entry.isSymbolicLink()) {
      return createSymlinkStats(entry.target.length, options);
    }

    throw new ERR_INVALID_STATE("Unknown entry type");
  }

  openSync(path: string, flags: string | number = "r", mode?: number): VirtualFileHandle {
    const normalized = this.#normalizePath(path);

    // Normalize numeric flags to string
    flags = normalizeFlags(flags);

    // Handle create and exclusive modes
    const isCreate =
      flags === "w" ||
      flags === "w+" ||
      flags === "a" ||
      flags === "a+" ||
      flags === "wx" ||
      flags === "wx+" ||
      flags === "ax" ||
      flags === "ax+";
    const isExclusive = flags === "wx" || flags === "wx+" || flags === "ax" || flags === "ax+";

    const isWritable = flags !== "r";

    // Check readonly for any writable mode
    if (this.readonly && isWritable) {
      throw createEROFS("open", path);
    }

    let entry;
    try {
      entry = this.#getEntry(normalized, "open");
      // Exclusive flag: file must not exist
      if (isExclusive) {
        throw createEEXIST("open", path);
      }
    } catch (err) {
      if (!hasCode(err, "ENOENT") || !isCreate) {
        throw err;
      }
      // Create the file
      const parent = this.#ensureParent(normalized, false, "open");

      const name = pathPosix.basename(normalized);
      entry = new MemoryEntry(TYPE_FILE, { mode });
      entry.content = NodeBuffer.alloc(0);
      parent.children.set(name, entry);
      const now = DateNow();
      parent.mtime = now;
      parent.ctime = now;
    }

    if (entry.isDirectory()) {
      throw createEISDIR("open", path);
    }

    if (entry.isSymbolicLink()) {
      // Should have been resolved already, but just in case
      throw createEINVAL("open", path);
    }

    const getStats = (size: number) => this.#createStats(entry, size);
    return new MemoryFileHandle(
      normalized,
      flags,
      mode ?? entry.mode,
      entry.content,
      entry,
      getStats,
    );
  }

  async open(
    path: string,
    flags: string | number = "r",
    mode?: number,
  ): Promise<VirtualFileHandle> {
    return this.openSync(path, flags, mode);
  }

  statSync(path: string, options?: StatOptions): FileStats {
    const entry = this.#getEntry(path, "stat", true);
    return this.#createStats(entry, undefined, options?.bigint);
  }

  async stat(path: string, options?: StatOptions): Promise<FileStats> {
    return this.statSync(path, options);
  }

  lstatSync(path: string, options?: StatOptions): FileStats {
    const entry = this.#getEntry(path, "lstat", false);
    return this.#createStats(entry, undefined, options?.bigint);
  }

  async lstat(path: string, options?: StatOptions): Promise<FileStats> {
    return this.lstatSync(path, options);
  }

  readdirSync(path: string, options?: DirectoryOptions): DirectoryEntries {
    const entry = this.#getEntry(path, "scandir", true);
    if (!entry.isDirectory()) {
      throw createENOTDIR("scandir", path);
    }

    const normalized = this.#normalizePath(path);

    const withFileTypes = options?.withFileTypes === true;

    const recursive = options?.recursive === true;

    if (recursive) {
      return this.#readdirRecursive(entry, normalized, withFileTypes);
    }

    if (withFileTypes) {
      const dirents: Dirent<string>[] = [];
      for (const { 0: name, 1: childEntry } of entry.children) {
        let type: "file" | "directory" | "symlink";
        if (childEntry.isSymbolicLink()) {
          type = UV_DIRENT_LINK;
        } else if (childEntry.isDirectory()) {
          type = UV_DIRENT_DIR;
        } else {
          type = UV_DIRENT_FILE;
        }
        dirents.push(new Dirent(name, normalized, type));
      }
      return dirents;
    }

    return Array.from(entry.children.keys());
  }

  #readdirRecursive(
    dirEntry: MemoryEntry,
    dirPath: string,
    withFileTypes: boolean,
  ): DirectoryEntries {
    const results: (string | Dirent<string>)[] = [];
    // Directories on the current traversal path. A directory reached again
    // through a symlink cycle is not descended into (but is still listed).
    const active = new Set<MemoryEntry>();

    // Traverse depth-first with an explicit stack instead of recursion, so a
    // deeply nested tree cannot exhaust the call stack. Each frame is a
    // directory being walked together with a snapshot of its children and the
    // index of the next child to visit.
    const enter = (entry: MemoryEntry, currentPath: string, relativePath: string): void => {
      active.add(entry);
      stack.push({
        entry,
        currentPath,
        relativePath,
        children: Array.from(entry.children),
        index: 0,
      });
    };

    const stack: {
      entry: MemoryEntry;

      currentPath: string;

      relativePath: string;

      children: [string, MemoryEntry][];

      index: number;
    }[] = [];
    enter(dirEntry, dirPath, "");

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.children.length) {
        active.delete(frame.entry);
        stack.pop();
        continue;
      }

      const { 0: name, 1: childEntry } = frame.children[frame.index++];

      const childRelative = frame.relativePath ? frame.relativePath + "/" + name : name;

      if (withFileTypes) {
        let type: "file" | "directory" | "symlink";
        if (childEntry.isSymbolicLink()) {
          type = UV_DIRENT_LINK;
        } else if (childEntry.isDirectory()) {
          type = UV_DIRENT_DIR;
        } else {
          type = UV_DIRENT_FILE;
        }
        results.push(new Dirent(childRelative, dirPath, type));
      } else {
        results.push(childRelative);
      }

      // Follow symlinks to directories for recursive traversal, skipping any
      // directory already on the active path to avoid symlink cycles.
      let resolvedChild = childEntry;
      if (childEntry.isSymbolicLink()) {
        const targetPath = this.#resolveSymlinkTarget(
          pathPosix.join(frame.currentPath, name),
          childEntry.target,
        );
        const result = this.#lookupEntry(targetPath, true, 0);
        if (result.entry) {
          resolvedChild = result.entry;
        }
      }
      if (resolvedChild.isDirectory() && !active.has(resolvedChild)) {
        enter(resolvedChild, pathPosix.join(frame.currentPath, name), childRelative);
      }
    }

    return results as string[] | Dirent<string>[];
  }

  async readdir(path: string, options?: DirectoryOptions): Promise<DirectoryEntries> {
    return this.readdirSync(path, options);
  }

  mkdirSync(path: string, options?: MkdirOptions): string | undefined {
    if (this.readonly) {
      throw createEROFS("mkdir", path);
    }

    const normalized = this.#normalizePath(path);

    const recursive = options?.recursive === true;

    // Check if already exists
    const existing = this.#lookupEntry(normalized, true);
    if (existing.entry) {
      if (existing.entry.isDirectory() && recursive) {
        // Already exists, that's ok for recursive
        return undefined;
      }
      throw createEEXIST("mkdir", path);
    }

    if (recursive) {
      // Create all parent directories
      const segments = this.#splitPath(normalized);

      let current = this.#root;

      let currentPath = "/";

      let resolvedCurrentPath = "/";

      let firstCreated;

      for (const segment of segments) {
        currentPath = pathPosix.join(currentPath, segment);
        const resolvedPath = pathPosix.join(resolvedCurrentPath, segment);

        let entry = current.children.get(segment);
        if (!entry) {
          entry = new MemoryEntry(TYPE_DIR, { mode: options?.mode });
          entry.children = new Map<string, MemoryEntry>();
          current.children.set(segment, entry);
          if (firstCreated === undefined) {
            firstCreated = currentPath;
          }
          resolvedCurrentPath = resolvedPath;
        } else if (entry.isSymbolicLink()) {
          const targetPath = this.#resolveSymlinkTarget(resolvedPath, entry.target);

          const result = this.#lookupEntry(targetPath, true, 0);
          if (result.eloop) {
            throw createELOOP("mkdir", path);
          }
          if (!result.entry) {
            throw createENOENT("mkdir", path);
          }
          entry = result.entry;
          resolvedCurrentPath = result.resolvedPath!;
        } else {
          resolvedCurrentPath = resolvedPath;
        }

        if (!entry.isDirectory()) {
          throw createENOTDIR("mkdir", path);
        }
        current = entry;
      }
      return firstCreated;
    }

    const parent = this.#ensureParent(normalized, false, "mkdir");

    const name = pathPosix.basename(normalized);

    const entry = new MemoryEntry(TYPE_DIR, { mode: options?.mode });
    entry.children = new Map<string, MemoryEntry>();
    parent.children.set(name, entry);
    const now = DateNow();
    parent.mtime = now;
    parent.ctime = now;
    return undefined;
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<string | undefined> {
    return this.mkdirSync(path, options);
  }

  rmdirSync(path: string): void {
    if (this.readonly) {
      throw createEROFS("rmdir", path);
    }

    const normalized = this.#normalizePath(path);

    const entry = this.#getEntry(normalized, "rmdir", false);

    if (!entry.isDirectory()) {
      throw createENOTDIR("rmdir", path);
    }

    if (entry.children.size > 0) {
      throw createENOTEMPTY("rmdir", path);
    }

    const parent = this.#ensureParent(normalized, false, "rmdir");

    const name = pathPosix.basename(normalized);
    parent.children.delete(name);
    const now = DateNow();
    parent.mtime = now;
    parent.ctime = now;
  }

  async rmdir(path: string): Promise<void> {
    this.rmdirSync(path);
  }

  unlinkSync(path: string): void {
    if (this.readonly) {
      throw createEROFS("unlink", path);
    }

    const normalized = this.#normalizePath(path);

    const entry = this.#getEntry(normalized, "unlink", false);

    if (entry.isDirectory()) {
      throw createEISDIR("unlink", path);
    }

    const parent = this.#ensureParent(normalized, false, "unlink");

    const name = pathPosix.basename(normalized);
    parent.children.delete(name);
    entry.nlink--;
    const now = DateNow();
    parent.mtime = now;
    parent.ctime = now;
  }

  async unlink(path: string): Promise<void> {
    this.unlinkSync(path);
  }

  renameSync(oldPath: string, newPath: string): void {
    if (this.readonly) {
      throw createEROFS("rename", oldPath);
    }

    const normalizedOld = this.#normalizePath(oldPath);

    const normalizedNew = this.#normalizePath(newPath);

    // Get the entry (without following symlinks for the entry itself)
    const entry = this.#getEntry(normalizedOld, "rename", false);

    if (entry.isDirectory() && startsWith(normalizedNew, `${normalizedOld}/`)) {
      throw createEINVAL("rename", oldPath);
    }

    // Validate destination parent exists (do not auto-create)
    const newParent = this.#ensureParent(normalizedNew, false, "rename");

    const newName = pathPosix.basename(normalizedNew);

    // Check if destination exists
    const existingDest = newParent.children.get(newName);
    if (existingDest) {
      // Cannot overwrite a directory with a non-directory
      if (existingDest.isDirectory() && !entry.isDirectory()) {
        throw createEISDIR("rename", newPath);
      }
      // Cannot overwrite a non-directory with a directory
      if (!existingDest.isDirectory() && entry.isDirectory()) {
        throw createENOTDIR("rename", newPath);
      }
    }

    // Remove from old location (after destination validation)
    const oldParent = this.#ensureParent(normalizedOld, false, "rename");

    const oldName = pathPosix.basename(normalizedOld);
    oldParent.children.delete(oldName);

    // Add to new location
    newParent.children.set(newName, entry);

    const now = DateNow();
    oldParent.mtime = now;
    oldParent.ctime = now;
    if (newParent !== oldParent) {
      newParent.mtime = now;
      newParent.ctime = now;
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.renameSync(oldPath, newPath);
  }

  linkSync(existingPath: string, newPath: string): void {
    if (this.readonly) {
      throw createEROFS("link", newPath);
    }

    const normalizedExisting = this.#normalizePath(existingPath);

    const normalizedNew = this.#normalizePath(newPath);

    const entry = this.#getEntry(normalizedExisting, "link", true);
    if (!entry.isFile()) {
      // Hard links to directories are not supported
      throw createEINVAL("link", existingPath);
    }

    // Check if new path already exists
    const existing = this.#lookupEntry(normalizedNew, false);
    if (existing.entry) {
      throw createEEXIST("link", newPath);
    }

    const parent = this.#ensureParent(normalizedNew, false, "link");

    const name = pathPosix.basename(normalizedNew);
    // Hard link: same entry object referenced by both names
    parent.children.set(name, entry);
    entry.nlink++;
    const now = DateNow();
    parent.mtime = now;
    parent.ctime = now;
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    this.linkSync(existingPath, newPath);
  }

  readlinkSync(path: string, _options?: DirectoryOptions): string | Buffer {
    const normalized = this.#normalizePath(path);

    const entry = this.#getEntry(normalized, "readlink", false);

    if (!entry.isSymbolicLink()) {
      throw createEINVAL("readlink", path);
    }

    return entry.target;
  }

  async readlink(path: string, options?: DirectoryOptions): Promise<string | Buffer> {
    return this.readlinkSync(path, options);
  }

  symlinkSync(target: string, path: string, _type?: string): void {
    if (this.readonly) {
      throw createEROFS("symlink", path);
    }

    const normalized = this.#normalizePath(path);

    // Check if already exists
    const existing = this.#lookupEntry(normalized, false);
    if (existing.entry) {
      throw createEEXIST("symlink", path);
    }

    const parent = this.#ensureParent(normalized, false, "symlink");

    const name = pathPosix.basename(normalized);

    const entry = new MemoryEntry(TYPE_SYMLINK);
    entry.target = target;
    parent.children.set(name, entry);
    const now = DateNow();
    parent.mtime = now;
    parent.ctime = now;
  }

  async symlink(target: string, path: string, type?: string): Promise<void> {
    this.symlinkSync(target, path, type);
  }

  realpathSync(path: string, _options?: DirectoryOptions): string {
    const result = this.#lookupEntry(path, true, 0);
    if (result.eloop) {
      throw createELOOP("realpath", path);
    }
    if (!result.entry) {
      throw createENOENT("realpath", path);
    }
    return result.resolvedPath!;
  }

  async realpath(path: string, options?: DirectoryOptions): Promise<string> {
    return this.realpathSync(path, options);
  }

  // === METADATA OPERATIONS ===

  chmodSync(path: string, mode: number): void {
    const entry = this.#getEntry(path, "chmod", true);
    // Preserve file type bits, update permission bits
    entry.mode = (entry.mode & ~0o7777) | (mode & 0o7777);
    entry.ctime = DateNow();
  }

  lchmodSync(path: string, mode: number): void {
    const entry = this.#getEntry(path, "chmod", false);
    // Preserve file type bits, update permission bits
    entry.mode = (entry.mode & ~0o7777) | (mode & 0o7777);
    entry.ctime = DateNow();
  }

  chownSync(path: string, uid: number, gid: number): void {
    const entry = this.#getEntry(path, "chown", true);
    if (uid >= 0) {
      entry.uid = uid;
    }
    if (gid >= 0) {
      entry.gid = gid;
    }
    entry.ctime = DateNow();
  }

  lchownSync(path: string, uid: number, gid: number): void {
    const entry = this.#getEntry(path, "chown", false);
    if (uid >= 0) {
      entry.uid = uid;
    }
    if (gid >= 0) {
      entry.gid = gid;
    }
    entry.ctime = DateNow();
  }

  utimesSync(path: string, atime: Time, mtime: Time): void {
    const entry = this.#getEntry(path, "utime", true);
    entry.atime = toMs(atime);
    entry.mtime = toMs(mtime);
    entry.ctime = DateNow();
  }

  lutimesSync(path: string, atime: Time, mtime: Time): void {
    const entry = this.#getEntry(path, "utime", false);
    entry.atime = toMs(atime);
    entry.mtime = toMs(mtime);
    entry.ctime = DateNow();
  }

  // === WATCH OPERATIONS ===

  watch(..._args: unknown[]): never {
    return unsupported("MemoryProvider.watch");
  }

  watchAsync(..._args: unknown[]): never {
    return unsupported("MemoryProvider.watchAsync");
  }

  watchFile(..._args: unknown[]): never {
    return unsupported("MemoryProvider.watchFile");
  }

  unwatchFile(..._args: unknown[]): never {
    return unsupported("MemoryProvider.unwatchFile");
  }
}
