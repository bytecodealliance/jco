/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/file_handle.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed handles, shared Buffer; preserve upstream descriptor and append behavior.
 */
import { Buffer as NodeBuffer } from "node:buffer";
import type { Buffer } from "./types.js";
import { createEBADF, ERR_METHOD_NOT_IMPLEMENTED } from "./errors.js";
import type {
  FileStats,
  FileData,
  FileOptions,
  ReadFileOptions,
  StatOptions,
  Position,
} from "./types.js";

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
