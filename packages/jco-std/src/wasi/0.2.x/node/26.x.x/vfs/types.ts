import type { Stats, Dirent } from "../../24.x.x/fs/classes.js";

export type FileStats = Stats<number | bigint>;

export type FileData = string | Uint8Array;

export type Position = number | bigint | null;

export interface VfsOptions {
  emitExperimentalWarning?: boolean;
}

export interface FileOptions {
  encoding?: BufferEncoding | null;

  flag?: string;

  mode?: number;
}

export type ReadFileOptions = BufferEncoding | FileOptions | null;

export interface StatOptions {
  bigint?: boolean;

  throwIfNoEntry?: boolean;
}

export interface DirectoryOptions {
  encoding?: BufferEncoding | "buffer";

  recursive?: boolean;

  withFileTypes?: boolean;

  bufferSize?: number;
}

export interface MkdirOptions {
  recursive?: boolean;

  mode?: number;
}

export interface RemoveOptions {
  recursive?: boolean;

  force?: boolean;
}

export type DirectoryEntries = string[] | Buffer[] | Dirent<string>[];

export type Time = number | string | Date;

export type Callback<T = void> = (error: Error | null, value?: T) => void;

export type { BufferEncoding } from "../../24.x.x/fs/public-types.js";
import type { BufferEncoding } from "../../24.x.x/fs/public-types.js";

/** Buffer methods used by the VFS contract, without an @types/node dependency.
 * Runtime values are the same Buffer objects as the component's node:buffer.
 */
export interface Buffer extends Uint8Array {
  toString(encoding?: BufferEncoding, start?: number, end?: number): string;
  subarray(start?: number, end?: number): Buffer;
  copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  equals(other: Uint8Array): boolean;
}
