export type PathLike = string | URL | Uint8Array;
export type Mode = number | string;
export type TimeLike = string | number | Date;
export type OpenMode = number | string;
export type BufferEncoding =
  | "ascii"
  | "base64"
  | "base64url"
  | "binary"
  | "hex"
  | "latin1"
  | "ucs-2"
  | "ucs2"
  | "utf-8"
  | "utf16le"
  | "utf8"
  | "utf-16le";

export type BinaryData = ArrayBuffer | ArrayBufferView;
export type FileData = string | BinaryData;
export type NoParamCallback = (error: Error | null) => void;

export interface EncodingOptions {
  encoding?: BufferEncoding | "buffer" | null;
}

export interface FlagOptions extends EncodingOptions {
  flag?: string;
  mode?: Mode;
  signal?: AbortSignal;
  flush?: boolean;
}

export interface StatOptions {
  bigint?: boolean;
  throwIfNoEntry?: boolean;
}

export interface ReaddirOptions extends EncodingOptions {
  recursive?: boolean;
  withFileTypes?: boolean;
}

export interface MakeDirectoryOptions {
  recursive?: boolean;
  mode?: Mode;
}

export interface RemoveOptions {
  force?: boolean;
  maxRetries?: number;
  recursive?: boolean;
  retryDelay?: number;
}

export interface CopyOptions {
  dereference?: boolean;
  errorOnExist?: boolean;
  force?: boolean;
  preserveTimestamps?: boolean;
  recursive?: boolean;
  verbatimSymlinks?: boolean;
  filter?: (source: string, destination: string) => boolean | Promise<boolean>;
}

export interface GlobOptions {
  cwd?: PathLike;
  exclude?: string | readonly string[] | ((path: string) => boolean);
  withFileTypes?: boolean;
}

export interface OpenDirOptions extends EncodingOptions {
  bufferSize?: number;
  recursive?: boolean;
}

export interface ReadOptions {
  offset?: number;
  length?: number;
  position?: number | bigint | null;
}

export interface WriteOptions {
  offset?: number;
  length?: number;
  position?: number | null;
}

export interface DisposableTempDir {
  path: string;
  remove(): void;
  [Symbol.dispose](): void;
}

export interface AsyncDisposableTempDir {
  path: string;
  remove(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface ReadResult<T extends ArrayBufferView = Uint8Array> {
  bytesRead: number;
  buffer: T;
}

export interface WriteResult<T extends ArrayBufferView = Uint8Array> {
  bytesWritten: number;
  buffer: T;
}

export interface ReadVResult<T extends readonly ArrayBufferView[] = readonly ArrayBufferView[]> {
  bytesRead: number;
  buffers: T;
}

export interface WriteVResult<T extends readonly ArrayBufferView[] = readonly ArrayBufferView[]> {
  bytesWritten: number;
  buffers: T;
}
