import type { HostErrno, HostErrorBase, HostResult } from "../internal/wit-types.js";

export type FsResult<T> = HostResult<T, FsError>;

export type FsPath =
  | { tag: "text"; val: string }
  | { tag: "bytes"; val: Uint8Array }
  | { tag: "file-url"; val: string };

export type FsPathOrDescriptor = { tag: "path"; val: FsPath } | { tag: "descriptor"; val: number };

export type FsMode = { tag: "number"; val: number } | { tag: "symbolic"; val: string };

export type FsOpenMode = { tag: "number"; val: number } | { tag: "symbolic"; val: string };

export type FsErrno = HostErrno;

export interface FsError extends HostErrorBase {
  path?: string;
  dest?: string;
}

export type FsFileType =
  | "block"
  | "character"
  | "directory"
  | "fifo"
  | "file"
  | "socket"
  | "symlink"
  | "unknown";

export type FsNumeric = { tag: "number"; val: number } | { tag: "bigint"; val: bigint };

export interface FsStats {
  dev: FsNumeric;
  ino: FsNumeric;
  mode: FsNumeric;
  nlink: FsNumeric;
  uid: FsNumeric;
  gid: FsNumeric;
  rdev: FsNumeric;
  size: FsNumeric;
  blksize: FsNumeric;
  blocks: FsNumeric;
  atimeMs: FsNumeric;
  mtimeMs: FsNumeric;
  ctimeMs: FsNumeric;
  birthtimeMs: FsNumeric;
  atimeNs?: bigint;
  mtimeNs?: bigint;
  ctimeNs?: bigint;
  birthtimeNs?: bigint;
  fileType: FsFileType;
}

export interface FsStatFs {
  type: FsNumeric;
  bsize: FsNumeric;
  blocks: FsNumeric;
  bfree: FsNumeric;
  bavail: FsNumeric;
  files: FsNumeric;
  ffree: FsNumeric;
}

export interface FsDirent {
  name: string;
  parentPath: string;
  fileType: FsFileType;
}

export type FsDirectoryEntry = { tag: "name"; val: string } | { tag: "dirent"; val: FsDirent };

export type FsGlobEntry = { tag: "path"; val: string } | { tag: "dirent"; val: FsDirent };

export type FsGlobExclude = { tag: "pattern"; val: string } | { tag: "patterns"; val: string[] };

export interface FsCopyOptions {
  dereference: boolean;
  errorOnExist: boolean;
  force: boolean;
  preserveTimestamps: boolean;
  recursive: boolean;
  verbatimSymlinks: boolean;
}

export interface FsGlobOptions {
  cwd?: FsPath;
  exclude?: FsGlobExclude;
  withFileTypes: boolean;
}

export interface FsMkdirOptions {
  recursive: boolean;
  mode?: FsMode;
}

export interface FsReaddirOptions {
  recursive: boolean;
  withFileTypes: boolean;
}

export interface FsRemoveOptions {
  force: boolean;
  maxRetries: number;
  recursive: boolean;
  retryDelay: number;
}

export interface FsStatOptions {
  bigint: boolean;
  throwIfNoEntry: boolean;
}

export interface FsReadFileOptions {
  flag?: string;
}

export interface FsWriteFileOptions {
  flag?: string;
  mode?: FsMode;
  flush: boolean;
}

export interface FsReadResult {
  bytesRead: number;
  data: Uint8Array;
}

export interface FsReadVResult {
  bytesRead: number;
  buffers: Uint8Array[];
}

export interface FsHost {
  access(path: FsPath, mode: number): FsResult<void>;
  appendFile(
    file: FsPathOrDescriptor,
    data: Uint8Array,
    options: FsWriteFileOptions,
  ): FsResult<void>;
  chmod(path: FsPath, mode: FsMode): FsResult<void>;
  chown(path: FsPath, uid: number, gid: number): FsResult<void>;
  close(descriptor: number): FsResult<void>;
  copyFile(source: FsPath, destination: FsPath, mode: number): FsResult<void>;
  cp(source: FsPath, destination: FsPath, options: FsCopyOptions): FsResult<void>;
  exists(path: FsPath): FsResult<boolean>;
  fchmod(descriptor: number, mode: FsMode): FsResult<void>;
  fchown(descriptor: number, uid: number, gid: number): FsResult<void>;
  fdatasync(descriptor: number): FsResult<void>;
  fstat(descriptor: number, options: FsStatOptions): FsResult<FsStats>;
  fsync(descriptor: number): FsResult<void>;
  ftruncate(descriptor: number, length: number): FsResult<void>;
  futimes(descriptor: number, atime: number, mtime: number): FsResult<void>;
  glob(patterns: string[], options: FsGlobOptions): FsResult<FsGlobEntry[]>;
  lchown(path: FsPath, uid: number, gid: number): FsResult<void>;
  link(existingPath: FsPath, newPath: FsPath): FsResult<void>;
  lstat(path: FsPath, options: FsStatOptions): FsResult<FsStats | undefined>;
  lutimes(path: FsPath, atime: number, mtime: number): FsResult<void>;
  mkdir(path: FsPath, options: FsMkdirOptions): FsResult<string | undefined>;
  mkdtemp(prefix: string): FsResult<string>;
  open(path: FsPath, flags: FsOpenMode, mode: FsMode): FsResult<number>;
  readFile(file: FsPathOrDescriptor, options: FsReadFileOptions): FsResult<Uint8Array>;
  readdir(path: FsPath, options: FsReaddirOptions): FsResult<FsDirectoryEntry[]>;
  readlink(path: FsPath): FsResult<string>;
  realpath(path: FsPath): FsResult<string>;
  rename(oldPath: FsPath, newPath: FsPath): FsResult<void>;
  rm(path: FsPath, options: FsRemoveOptions): FsResult<void>;
  rmdir(path: FsPath, options: FsRemoveOptions): FsResult<void>;
  stat(path: FsPath, options: FsStatOptions): FsResult<FsStats | undefined>;
  statfs(path: FsPath, bigint: boolean): FsResult<FsStatFs>;
  symlink(target: FsPath, path: FsPath, type?: string): FsResult<void>;
  truncate(path: FsPath, length: number): FsResult<void>;
  unlink(path: FsPath): FsResult<void>;
  utimes(path: FsPath, atime: number, mtime: number): FsResult<void>;
  writeFile(
    file: FsPathOrDescriptor,
    data: Uint8Array,
    options: FsWriteFileOptions,
  ): FsResult<void>;
  read(descriptor: number, length: number, position?: bigint): FsResult<FsReadResult>;
  write(descriptor: number, data: Uint8Array, position?: bigint): FsResult<number>;
  readv(descriptor: number, lengths: number[], position?: bigint): FsResult<FsReadVResult>;
  writev(descriptor: number, buffers: Uint8Array[], position?: bigint): FsResult<number>;
}
