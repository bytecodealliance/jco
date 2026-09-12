/** Contracts reconciled with @types/node 24.13.3 and Node v24.20.0 lib/zlib.js
 * (71b8b174857e25106d39b61a9e6f30d927da8b01, MIT). Local declarations use
 * portable bytes and streams; no Node ambient types are required by consumers. */
import type { Transform, TransformOptions, Callback } from "../stream/types.js";
import type { HostErrorBase, HostResult } from "../internal/wit-types.js";

export type Input = string | ArrayBuffer | ArrayBufferView;

export interface ZlibBuffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;

  equals(other: Uint8Array): boolean;
}

export interface ZlibOptions extends Omit<TransformOptions, "flush"> {
  flush?: number;
  finishFlush?: number;
  chunkSize?: number;
  windowBits?: number;
  level?: number;
  memLevel?: number;
  strategy?: number;
  dictionary?: ArrayBuffer | ArrayBufferView;
  info?: boolean;
  maxOutputLength?: number;
  rejectGarbageAfterEnd?: boolean;
}

export interface BrotliOptions extends ZlibOptions {
  params?: Record<number, number | boolean>;
}

export interface ZstdOptions extends BrotliOptions {
  pledgedSrcSize?: number;
}

export interface Zlib extends Transform {
  bytesWritten: number;
  readonly bytesRead: never;

  close(callback?: Callback): void;

  flush(kind?: number, callback?: Callback): void;
  flush(callback?: Callback): void;

  reset(): void;
}

export interface ZlibWithParams extends Zlib {
  params(level: number, strategy: number, callback: Callback): void;
}

export interface ZlibConstructor<O extends ZlibOptions, T extends Zlib = Zlib> {
  new (options?: O): T;
  (options?: O): T;

  prototype: T;
}

export interface ZlibInfo<T extends Zlib = Zlib> {
  buffer: ZlibBuffer;
  engine: T;
}

export type ZlibCallback<T> = (
  ...args: [error: Error, result?: undefined] | [error: null, result: T]
) => void;

export interface SyncMethod<O extends ZlibOptions, T extends Zlib> {
  (input: Input, options: O & { info: true }): ZlibInfo<T>;
  (input: Input, options?: O & { info?: false }): ZlibBuffer;
  (input: Input, options?: O): ZlibBuffer | ZlibInfo<T>;
}

export interface AsyncMethod<O extends ZlibOptions, T extends Zlib> {
  (input: Input, callback: ZlibCallback<ZlibBuffer>): void;
  (input: Input, options: O & { info: true }, callback: ZlibCallback<ZlibInfo<T>>): void;
  (input: Input, options: O & { info?: false }, callback: ZlibCallback<ZlibBuffer>): void;
  (input: Input, options: O, callback: ZlibCallback<ZlibBuffer | ZlibInfo<T>>): void;
}

export type Algorithm =
  | "deflate"
  | "inflate"
  | "gzip"
  | "gunzip"
  | "deflateraw"
  | "inflateraw"
  | "unzip"
  | "brotlicompress"
  | "brotlidecompress"
  | "zstdcompress"
  | "zstddecompress";

/** Only compression parameters cross WIT; stream callbacks and scheduling stay guest-side. */
export interface HostOptions {
  flush?: number;
  finishFlush?: number;
  chunkSize?: number;
  windowBits?: number;
  level?: number;
  memLevel?: number;
  strategy?: number;
  maxOutputLength?: number;
  pledgedSrcSize?: number;
  rejectGarbageAfterEnd?: boolean;
  dictionary?: Uint8Array;
  params?: Array<[string, number]>;
}

export interface Output {
  data: Uint8Array;
  bytesWritten: number;
}

export type ZlibError = HostErrorBase;

export type Result<T> = T | HostResult<T, ZlibError>;

export interface Engine {
  write(data: Uint8Array): Result<Output>;

  finish(): Result<Output>;

  flush(kind: number): Result<Output>;

  params(level: number, strategy: number): Result<Output>;

  reset(): Result<void>;

  close(): Result<void>;

  [Symbol.dispose]?(): void;
}

export interface ZlibProvider {
  open(algorithm: Algorithm, options: HostOptions): Result<Engine>;

  compress(algorithm: Algorithm, data: Uint8Array, options: HostOptions): Result<Output>;

  crc32(data: Uint8Array, value: number): Result<number>;
}

export interface ZlibModule {
  constants: Readonly<Record<string, number>>;
  codes: Readonly<Record<string, string | number>>;

  crc32(data: string | ArrayBufferView, value?: number): number;

  Deflate: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createDeflate: (options?: ZlibOptions) => ZlibWithParams;
  deflate: AsyncMethod<ZlibOptions, ZlibWithParams>;
  deflateSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  Inflate: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createInflate: (options?: ZlibOptions) => ZlibWithParams;
  inflate: AsyncMethod<ZlibOptions, ZlibWithParams>;
  inflateSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  Gzip: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createGzip: (options?: ZlibOptions) => ZlibWithParams;
  gzip: AsyncMethod<ZlibOptions, ZlibWithParams>;
  gzipSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  Gunzip: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createGunzip: (options?: ZlibOptions) => ZlibWithParams;
  gunzip: AsyncMethod<ZlibOptions, ZlibWithParams>;
  gunzipSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  DeflateRaw: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createDeflateRaw: (options?: ZlibOptions) => ZlibWithParams;
  deflateRaw: AsyncMethod<ZlibOptions, ZlibWithParams>;
  deflateRawSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  InflateRaw: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createInflateRaw: (options?: ZlibOptions) => ZlibWithParams;
  inflateRaw: AsyncMethod<ZlibOptions, ZlibWithParams>;
  inflateRawSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  Unzip: ZlibConstructor<ZlibOptions, ZlibWithParams>;
  createUnzip: (options?: ZlibOptions) => ZlibWithParams;
  unzip: AsyncMethod<ZlibOptions, ZlibWithParams>;
  unzipSync: SyncMethod<ZlibOptions, ZlibWithParams>;

  BrotliCompress: ZlibConstructor<BrotliOptions, Zlib>;
  createBrotliCompress: (options?: BrotliOptions) => Zlib;
  brotliCompress: AsyncMethod<BrotliOptions, Zlib>;
  brotliCompressSync: SyncMethod<BrotliOptions, Zlib>;

  BrotliDecompress: ZlibConstructor<BrotliOptions, Zlib>;
  createBrotliDecompress: (options?: BrotliOptions) => Zlib;
  brotliDecompress: AsyncMethod<BrotliOptions, Zlib>;
  brotliDecompressSync: SyncMethod<BrotliOptions, Zlib>;

  ZstdCompress: ZlibConstructor<ZstdOptions, Zlib>;
  createZstdCompress: (options?: ZstdOptions) => Zlib;
  zstdCompress: AsyncMethod<ZstdOptions, Zlib>;
  zstdCompressSync: SyncMethod<ZstdOptions, Zlib>;

  ZstdDecompress: ZlibConstructor<ZstdOptions, Zlib>;
  createZstdDecompress: (options?: ZstdOptions) => Zlib;
  zstdDecompress: AsyncMethod<ZstdOptions, Zlib>;
  zstdDecompressSync: SyncMethod<ZstdOptions, Zlib>;
}
