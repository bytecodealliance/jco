/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/file_handle.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed handles, shared Buffer; preserve upstream descriptor and append behavior.
 */
import { Buffer as NodeBuffer } from "node:buffer";
import type { Buffer } from "./types.js";
import { createEBADF, ERR_INVALID_STATE, ERR_METHOD_NOT_IMPLEMENTED } from "./errors.js";
import type { MemoryEntry } from "./memory.js";
import type {
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  Position,
} from "./types.js";

const DateNow = Date.now;

const MathMax = Math.max;

const MathMin = Math.min;

function isCurrentPosition(position: Position | undefined): boolean {
  return position === null || position === undefined || position === -1;
}

/**
 * Base class for virtual file handles.
 * Provides the interface that file handles must implement.
 */
export class VirtualFileHandle {
  #pathValue: string;

  #flagsValue: string;

  #modeValue: number;

  #positionValue: number;

  #closedValue: boolean;

  constructor(path: string, flags: string, mode?: number) {
    this.#pathValue = path;
    this.#flagsValue = flags;
    this.#modeValue = mode ?? 0o644;
    this.#positionValue = 0;
    this.#closedValue = false;
  }

  get path(): string {
    return this.#pathValue;
  }

  get flags(): string {
    return this.#flagsValue;
  }

  get mode(): number {
    return this.#modeValue;
  }

  get position(): number {
    return this.#positionValue;
  }

  set position(pos: number) {
    this.#positionValue = pos;
  }

  get closed(): boolean {
    return this.#closedValue;
  }

  #checkClosed(syscall: string): void {
    if (this.#closedValue) {
      throw createEBADF(syscall);
    }
  }

  async read(
    _buffer: Buffer,
    _offset: number,
    _length: number,
    _position?: Position,
  ): Promise<{ bytesRead: number; buffer: Buffer }> {
    this.#checkClosed("read");
    throw new ERR_METHOD_NOT_IMPLEMENTED("read");
  }

  readSync(_buffer: Buffer, _offset: number, _length: number, _position?: Position): number {
    this.#checkClosed("read");
    throw new ERR_METHOD_NOT_IMPLEMENTED("readSync");
  }

  async write(
    _buffer: Buffer,
    _offset: number,
    _length: number,
    _position?: Position,
  ): Promise<{ bytesWritten: number; buffer: Buffer }> {
    this.#checkClosed("write");
    throw new ERR_METHOD_NOT_IMPLEMENTED("write");
  }

  writeSync(_buffer: Buffer, _offset: number, _length: number, _position?: Position): number {
    this.#checkClosed("write");
    throw new ERR_METHOD_NOT_IMPLEMENTED("writeSync");
  }

  async readFile(_options?: ReadFileOptions): Promise<Buffer | string> {
    this.#checkClosed("read");
    throw new ERR_METHOD_NOT_IMPLEMENTED("readFile");
  }

  readFileSync(_options?: ReadFileOptions): Buffer | string {
    this.#checkClosed("read");
    throw new ERR_METHOD_NOT_IMPLEMENTED("readFileSync");
  }

  async writeFile(_data: FileData, _options?: FileOptions): Promise<void> {
    this.#checkClosed("write");
    throw new ERR_METHOD_NOT_IMPLEMENTED("writeFile");
  }

  writeFileSync(_data: FileData, _options?: FileOptions): void {
    this.#checkClosed("write");
    throw new ERR_METHOD_NOT_IMPLEMENTED("writeFileSync");
  }

  async stat(_options?: StatOptions): Promise<FileStats> {
    this.#checkClosed("fstat");
    throw new ERR_METHOD_NOT_IMPLEMENTED("stat");
  }

  statSync(_options?: StatOptions): FileStats {
    this.#checkClosed("fstat");
    throw new ERR_METHOD_NOT_IMPLEMENTED("statSync");
  }

  async truncate(_len: number = 0): Promise<void> {
    this.#checkClosed("ftruncate");
    throw new ERR_METHOD_NOT_IMPLEMENTED("truncate");
  }

  truncateSync(_len: number = 0): void {
    this.#checkClosed("ftruncate");
    throw new ERR_METHOD_NOT_IMPLEMENTED("truncateSync");
  }

  async chmod(): Promise<void> {}

  async chown(): Promise<void> {}

  async utimes(): Promise<void> {}

  async datasync(): Promise<void> {}

  async sync(): Promise<void> {}

  async readv(
    buffers: Buffer[],
    position?: number | null,
  ): Promise<{ bytesRead: number; buffers: Buffer[] }> {
    this.#checkClosed("readv");
    let totalRead = 0;
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];

      const pos = position != null ? position + totalRead : null;

      const { bytesRead } = await this.read(buf, 0, buf.byteLength, pos);
      totalRead += bytesRead;
      if (bytesRead < buf.byteLength) {
        break;
      }
    }
    return { bytesRead: totalRead, buffers };
  }

  async writev(
    buffers: Buffer[],
    position?: number | null,
  ): Promise<{ bytesWritten: number; buffers: Buffer[] }> {
    this.#checkClosed("writev");
    let totalWritten = 0;
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];

      const pos = position != null ? position + totalWritten : null;

      const { bytesWritten } = await this.write(buf, 0, buf.byteLength, pos);
      totalWritten += bytesWritten;
      if (bytesWritten < buf.byteLength) {
        break;
      }
    }
    return { bytesWritten: totalWritten, buffers };
  }

  async appendFile(data: FileData, options?: FileOptions): Promise<void> {
    this.#checkClosed("appendFile");
    const buffer =
      typeof data === "string"
        ? NodeBuffer.from(data, options?.encoding ?? undefined)
        : NodeBuffer.from(data);
    await this.write(buffer, 0, buffer.length, null);
  }

  readableWebStream(): never {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readableWebStream");
  }

  readLines(): never {
    throw new ERR_METHOD_NOT_IMPLEMENTED("readLines");
  }

  createReadStream(): never {
    throw new ERR_METHOD_NOT_IMPLEMENTED("createReadStream");
  }

  createWriteStream(): never {
    throw new ERR_METHOD_NOT_IMPLEMENTED("createWriteStream");
  }

  [Symbol.dispose](): void {
    this.closeSync();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    this.#closedValue = true;
  }

  closeSync(): void {
    this.#closedValue = true;
  }
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
