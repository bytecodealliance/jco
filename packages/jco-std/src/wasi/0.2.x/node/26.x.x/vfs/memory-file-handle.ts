/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/file_handle.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed handles, shared Buffer; preserve upstream descriptor and append behavior.
 */
import { Buffer as NodeBuffer } from "node:buffer";
import type { Buffer } from "./types.js";
import { createEBADF, ERR_INVALID_STATE } from "./errors.js";
import type { MemoryEntry } from "./memory.js";
import type {
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  Position,
} from "./types.js";

import { VirtualFileHandle } from "./file-handle.js";

const DateNow = Date.now;

const MathMax = Math.max;

const MathMin = Math.min;

function isCurrentPosition(position: Position | undefined): boolean {
  return position === null || position === undefined || position === -1;
}

/**
 * A file handle for in-memory file content.
 * Used by MemoryProvider and similar providers.
 */
export class MemoryFileHandle extends VirtualFileHandle {
  #content: Buffer;

  #size: number;

  #entry: MemoryEntry;

  #getStats: (size: number) => FileStats;

  #checkClosed(syscall: string): void {
    if (this.closed) {
      throw createEBADF(syscall);
    }
  }

  constructor(
    path: string,
    flags: string,
    mode: number | undefined,
    content: Buffer,
    entry: MemoryEntry,
    getStats: (size: number) => FileStats,
  ) {
    super(path, flags, mode);
    this.#content = content;
    this.#size = content.length;
    this.#entry = entry;
    this.#getStats = getStats;

    // Handle different open modes
    if (flags === "w" || flags === "w+" || flags === "wx" || flags === "wx+") {
      // Write mode: truncate
      this.#content = NodeBuffer.alloc(0);
      this.#size = 0;
      if (entry) {
        entry.content = this.#content;
      }
    } else if (flags === "a" || flags === "a+" || flags === "ax" || flags === "ax+") {
      // Append mode: position at end
      this.position = this.#size;
    }
  }

  #checkWritable(): void {
    if (this.flags === "r") {
      throw createEBADF("write");
    }
  }

  #checkReadable(): void {
    const f = this.flags;
    if (f === "w" || f === "a" || f === "wx" || f === "ax") {
      throw createEBADF("read");
    }
  }

  #isAppend(): boolean {
    const f = this.flags;
    return f === "a" || f === "a+" || f === "ax" || f === "ax+";
  }

  get content(): Buffer {
    // If entry has a dynamic content provider, get fresh content sync
    if (this.#entry?.isDynamic && this.#entry.isDynamic()) {
      return this.#entry.getContentSync();
    }
    return this.#content.subarray(0, this.#size);
  }

  async getContentAsync(): Promise<Buffer> {
    // If entry has a dynamic content provider, get fresh content async
    if (this.#entry?.getContentAsync) {
      return this.#entry.getContentAsync();
    }
    return this.#content;
  }

  readSync(buffer: Buffer, offset: number, length: number, position?: Position): number {
    this.#checkClosed("read");
    this.#checkReadable();

    // Get content (resolves dynamic content providers)
    const content = this.content;

    const useCurrentPosition = isCurrentPosition(position);

    const readPos = useCurrentPosition ? this.position : Number(position);

    const available = content.length - readPos;

    if (available <= 0) {
      return 0;
    }

    const bytesToRead = MathMin(length, available);
    content.copy(buffer, offset, readPos, readPos + bytesToRead);

    // Update position if not using explicit position
    if (useCurrentPosition) {
      this.position = readPos + bytesToRead;
    }

    return bytesToRead;
  }

  async read(
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): Promise<{ bytesRead: number; buffer: Buffer }> {
    const bytesRead = this.readSync(buffer, offset, length, position);
    return { bytesRead, buffer };
  }

  writeSync(buffer: Buffer, offset: number, length: number, position?: Position): number {
    this.#checkClosed("write");
    this.#checkWritable();

    // In append mode, always write at the end
    const useCurrentPosition = isCurrentPosition(position);

    const writePos = this.#isAppend()
      ? this.#size
      : useCurrentPosition
        ? this.position
        : Number(position);
    const data = buffer.subarray(offset, offset + length);

    // Expand buffer if needed (geometric doubling for amortized O(1) appends)
    const neededSize = writePos + length;
    if (neededSize > this.#content.length) {
      const newCapacity = MathMax(neededSize, this.#content.length * 2);

      const newContent = NodeBuffer.alloc(newCapacity);
      this.#content.copy(newContent, 0, 0, this.#size);
      this.#content = newContent;
    }

    // Write the data
    this.#content.set(data, writePos);

    // Update actual content size
    if (neededSize > this.#size) {
      this.#size = neededSize;
    }

    // Update the entry's content, mtime, and ctime
    if (this.#entry) {
      const now = DateNow();
      this.#entry.content = this.#content.subarray(0, this.#size);
      this.#entry.mtime = now;
      this.#entry.ctime = now;
    }

    // Update position if not using explicit position
    if (useCurrentPosition) {
      this.position = writePos + length;
    }

    return length;
  }

  async write(
    buffer: Buffer,
    offset: number,
    length: number,
    position?: Position,
  ): Promise<{ bytesWritten: number; buffer: Buffer }> {
    const bytesWritten = this.writeSync(buffer, offset, length, position);
    return { bytesWritten, buffer };
  }

  readFileSync(options?: ReadFileOptions): Buffer | string {
    this.#checkClosed("read");
    this.#checkReadable();

    // Get content (resolves dynamic content providers)
    const content = this.content;

    const encoding = typeof options === "string" ? options : options?.encoding;
    if (encoding) {
      return content.toString(encoding);
    }
    return NodeBuffer.from(content);
  }

  async readFile(options?: ReadFileOptions): Promise<Buffer | string> {
    this.#checkClosed("read");
    this.#checkReadable();

    // Get content asynchronously (supports async content providers)
    const content = await this.getContentAsync();

    const encoding = typeof options === "string" ? options : options?.encoding;
    if (encoding) {
      return content.toString(encoding);
    }
    return NodeBuffer.from(content);
  }

  writeFileSync(data: FileData, options?: FileOptions): void {
    this.#checkClosed("write");
    this.#checkWritable();

    const buffer =
      typeof data === "string"
        ? NodeBuffer.from(data, options?.encoding ?? undefined)
        : NodeBuffer.from(data);

    // In append mode, append to existing content
    if (this.#isAppend()) {
      const neededSize = this.#size + buffer.length;
      if (neededSize > this.#content.length) {
        const newCapacity = MathMax(neededSize, this.#content.length * 2);

        const newContent = NodeBuffer.alloc(newCapacity);
        this.#content.copy(newContent, 0, 0, this.#size);
        this.#content = newContent;
      }
      this.#content.set(buffer, this.#size);
      this.#size = neededSize;
    } else {
      this.#content = NodeBuffer.from(buffer);
      this.#size = buffer.length;
    }

    // Update the entry's content, mtime, and ctime
    if (this.#entry) {
      const now = DateNow();
      this.#entry.content = this.#content.subarray(0, this.#size);
      this.#entry.mtime = now;
      this.#entry.ctime = now;
    }

    this.position = this.#size;
  }

  async writeFile(data: FileData, options?: FileOptions): Promise<void> {
    this.writeFileSync(data, options);
  }

  statSync(_options?: StatOptions): FileStats {
    this.#checkClosed("fstat");
    if (this.#entry) {
      return this.#getStats(this.#size);
    }
    throw new ERR_INVALID_STATE("stats not available");
  }

  async stat(options?: StatOptions): Promise<FileStats> {
    return this.statSync(options);
  }

  truncateSync(len: number = 0): void {
    this.#checkClosed("ftruncate");
    this.#checkWritable();

    if (len < this.#size) {
      // Zero out truncated region to avoid stale data
      this.#content.fill(0, len, this.#size);
      this.#size = len;
    } else if (len > this.#size) {
      if (len > this.#content.length) {
        const newContent = NodeBuffer.alloc(len);
        this.#content.copy(newContent, 0, 0, this.#size);
        this.#content = newContent;
      } else {
        // Buffer has enough capacity, just zero-fill the extension
        this.#content.fill(0, this.#size, len);
      }
      this.#size = len;
    }

    // Update the entry's content, mtime, and ctime
    if (this.#entry) {
      const now = DateNow();
      this.#entry.content = this.#content.subarray(0, this.#size);
      this.#entry.mtime = now;
      this.#entry.ctime = now;
    }
  }

  async truncate(len: number = 0): Promise<void> {
    this.truncateSync(len);
  }
}
