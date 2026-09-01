/**
 * Public filesystem value objects follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/fs/utils.js and
 * lib/internal/fs/dir.js (MIT license). Local classes are reconstructed from
 * transport-safe snapshots rather than Node native binding arrays.
 */
import { codedError, invalidArgType, unsupportedNodeApi } from "../errors/core.js";

import type { FsWireDirent, FsWireStats } from "./types.js";

type Numeric = number | bigint;
type FileType = FsWireStats["fileType"];

function unsupported(api: string): never {
  throw unsupportedNodeApi(
    api,
    "event-driven filesystem streams require a resource-oriented host interface",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numeric<T extends Numeric>(value: unknown, fallback: T): T {
  return (typeof value === "number" || typeof value === "bigint" ? value : fallback) as T;
}

function date(value: unknown): Date {
  return value instanceof Date ? value : new Date(0);
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
  readonly #fileType: FileType;

  constructor(snapshot?: FsWireStats) {
    const values = snapshot?.values ?? {};
    const zero = (typeof values.dev === "bigint" ? 0n : 0) as T;
    this.dev = numeric(values.dev, zero);
    this.ino = numeric(values.ino, zero);
    this.mode = numeric(values.mode, zero);
    this.nlink = numeric(values.nlink, zero);
    this.uid = numeric(values.uid, zero);
    this.gid = numeric(values.gid, zero);
    this.rdev = numeric(values.rdev, zero);
    this.size = numeric(values.size, zero);
    this.blksize = numeric(values.blksize, zero);
    this.blocks = numeric(values.blocks, zero);
    this.atimeMs = numeric(values.atimeMs, zero);
    this.mtimeMs = numeric(values.mtimeMs, zero);
    this.ctimeMs = numeric(values.ctimeMs, zero);
    this.birthtimeMs = numeric(values.birthtimeMs, zero);
    this.atimeNs = typeof values.atimeNs === "bigint" ? values.atimeNs : undefined;
    this.mtimeNs = typeof values.mtimeNs === "bigint" ? values.mtimeNs : undefined;
    this.ctimeNs = typeof values.ctimeNs === "bigint" ? values.ctimeNs : undefined;
    this.birthtimeNs = typeof values.birthtimeNs === "bigint" ? values.birthtimeNs : undefined;
    this.atime = date(values.atime);
    this.mtime = date(values.mtime);
    this.ctime = date(values.ctime);
    this.birthtime = date(values.birthtime);
    this.#fileType = snapshot?.fileType ?? "unknown";
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
  readonly #fileType: FileType;

  constructor(name: Name, parentPath: string, fileType: FileType = "unknown") {
    this.name = name;
    this.parentPath = parentPath;
    this.path = parentPath;
    this.#fileType = fileType;
  }

  static fromWire(value: unknown): Dirent<string | Uint8Array> {
    if (!isRecord(value) || value.__jcoNodeFs !== "dirent") {
      throw new TypeError("invalid filesystem dirent payload");
    }
    const wire = value as unknown as FsWireDirent;
    if (typeof wire.name !== "string" && !(wire.name instanceof Uint8Array)) {
      throw new TypeError("invalid filesystem dirent name");
    }
    return new Dirent(
      wire.name,
      typeof wire.parentPath === "string" ? wire.parentPath : "",
      wire.fileType,
    );
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
