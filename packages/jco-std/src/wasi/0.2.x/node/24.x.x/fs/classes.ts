/**
 * Public filesystem value objects follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/fs/utils.js and
 * lib/internal/fs/dir.js (MIT license). Local classes are reconstructed from
 * typed WIT records rather than Node native binding arrays.
 */
import { codedError, invalidArgType, unsupportedNodeApi } from "../errors/core.js";

import type { FsDirent, FsFileType, FsNumeric, FsStats } from "./types.js";

type Numeric = number | bigint;

function unsupported(api: string): never {
  throw unsupportedNodeApi(
    api,
    "event-driven filesystem streams require a resource-oriented host interface",
  );
}

function numeric<T extends Numeric>(value: FsNumeric, fallback: T): T {
  return (value.tag === "number" || value.tag === "bigint" ? value.val : fallback) as T;
}

function date(value: FsNumeric): Date {
  return new Date(Number(value.val));
}

function directoryClosed(): Error & { code: "ERR_DIR_CLOSED" } {
  return codedError(new Error("Directory handle was closed"), "ERR_DIR_CLOSED");
}

export class Stats<T extends Numeric = number> {
  readonly dev: T;
  readonly ino: T;
  readonly mode: T;
  readonly nlink: T;
  readonly uid: T;
  readonly gid: T;
  readonly rdev: T;
  readonly size: T;
  readonly blksize: T;
  readonly blocks: T;
  readonly atimeMs: T;
  readonly mtimeMs: T;
  readonly ctimeMs: T;
  readonly birthtimeMs: T;
  readonly atimeNs: bigint | undefined;
  readonly mtimeNs: bigint | undefined;
  readonly ctimeNs: bigint | undefined;
  readonly birthtimeNs: bigint | undefined;
  readonly atime: Date;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly birthtime: Date;
  readonly #fileType: FsFileType;

  constructor(snapshot: FsStats) {
    const zero = (snapshot.dev.tag === "bigint" ? 0n : 0) as T;
    this.dev = numeric(snapshot.dev, zero);
    this.ino = numeric(snapshot.ino, zero);
    this.mode = numeric(snapshot.mode, zero);
    this.nlink = numeric(snapshot.nlink, zero);
    this.uid = numeric(snapshot.uid, zero);
    this.gid = numeric(snapshot.gid, zero);
    this.rdev = numeric(snapshot.rdev, zero);
    this.size = numeric(snapshot.size, zero);
    this.blksize = numeric(snapshot.blksize, zero);
    this.blocks = numeric(snapshot.blocks, zero);
    this.atimeMs = numeric(snapshot.atimeMs, zero);
    this.mtimeMs = numeric(snapshot.mtimeMs, zero);
    this.ctimeMs = numeric(snapshot.ctimeMs, zero);
    this.birthtimeMs = numeric(snapshot.birthtimeMs, zero);
    this.atimeNs = snapshot.atimeNs;
    this.mtimeNs = snapshot.mtimeNs;
    this.ctimeNs = snapshot.ctimeNs;
    this.birthtimeNs = snapshot.birthtimeNs;
    this.atime = date(snapshot.atimeMs);
    this.mtime = date(snapshot.mtimeMs);
    this.ctime = date(snapshot.ctimeMs);
    this.birthtime = date(snapshot.birthtimeMs);
    this.#fileType = snapshot.fileType;
  }

  isBlockDevice(): boolean {
    return this.#fileType === "block";
  }

  isCharacterDevice(): boolean {
    return this.#fileType === "character";
  }

  isDirectory(): boolean {
    return this.#fileType === "directory";
  }

  isFIFO(): boolean {
    return this.#fileType === "fifo";
  }

  isFile(): boolean {
    return this.#fileType === "file";
  }

  isSocket(): boolean {
    return this.#fileType === "socket";
  }

  isSymbolicLink(): boolean {
    return this.#fileType === "symlink";
  }
}

export type BigIntStats = Stats<bigint>;

export class Dirent<Name extends string | Uint8Array = string> {
  readonly name: Name;
  readonly parentPath: string;
  readonly path: string;
  readonly #fileType: FsFileType;

  constructor(name: Name, parentPath: string, fileType: FsFileType = "unknown") {
    this.name = name;
    this.parentPath = parentPath;
    this.path = parentPath;
    this.#fileType = fileType;
  }

  static fromHost(value: FsDirent): Dirent<string> {
    return new Dirent(value.name, value.parentPath, value.fileType);
  }

  isBlockDevice(): boolean {
    return this.#fileType === "block";
  }

  isCharacterDevice(): boolean {
    return this.#fileType === "character";
  }

  isDirectory(): boolean {
    return this.#fileType === "directory";
  }

  isFIFO(): boolean {
    return this.#fileType === "fifo";
  }

  isFile(): boolean {
    return this.#fileType === "file";
  }

  isSocket(): boolean {
    return this.#fileType === "socket";
  }

  isSymbolicLink(): boolean {
    return this.#fileType === "symlink";
  }
}

type DirReadCallback = (error: Error | null, entry: Dirent | null) => void;
type DirCloseCallback = (error: Error | null) => void;

export class Dir implements AsyncIterable<Dirent>, Disposable, AsyncDisposable {
  readonly path: string;
  readonly #entries: Dirent[];
  #index = 0;
  #closed = false;

  constructor(path: string, entries: Dirent[]) {
    this.path = path;
    this.#entries = entries;
  }

  readSync(): Dirent | null {
    if (this.#closed) {
      throw directoryClosed();
    }
    return this.#entries[this.#index++] ?? null;
  }

  read(callback?: DirReadCallback): Promise<Dirent | null> | void {
    if (callback !== undefined) {
      if (typeof callback !== "function") {
        throw invalidArgType("callback", "Function", callback);
      }
      queueMicrotask(() => {
        let entry: Dirent | null;
        try {
          entry = this.readSync();
        } catch (error) {
          callback(error as Error, null);
          return;
        }
        callback(null, entry);
      });
      return;
    }
    return Promise.resolve().then(() => this.readSync());
  }

  closeSync(): void {
    if (this.#closed) {
      throw directoryClosed();
    }
    this.#closed = true;
  }

  close(callback?: DirCloseCallback): Promise<void> | void {
    if (callback !== undefined) {
      if (typeof callback !== "function") {
        throw invalidArgType("callback", "Function", callback);
      }
      queueMicrotask(() => {
        try {
          this.closeSync();
        } catch (error) {
          callback(error as Error);
          return;
        }
        callback(null);
      });
      return;
    }
    return Promise.resolve().then(() => this.closeSync());
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Dirent> {
    try {
      for (let entry = this.readSync(); entry !== null; entry = this.readSync()) {
        yield entry;
      }
    } finally {
      if (!this.#closed) {
        this.closeSync();
      }
    }
  }

  [Symbol.dispose](): void {
    if (!this.#closed) {
      this.closeSync();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

export class ReadStream {
  constructor(..._args: unknown[]) {
    unsupported("fs.ReadStream");
  }
}

export class WriteStream {
  constructor(..._args: unknown[]) {
    unsupported("fs.WriteStream");
  }
}

export class Utf8Stream {
  constructor(..._args: unknown[]) {
    unsupported("fs.Utf8Stream");
  }
}

export const FileReadStream = ReadStream;
export const FileWriteStream = WriteStream;
