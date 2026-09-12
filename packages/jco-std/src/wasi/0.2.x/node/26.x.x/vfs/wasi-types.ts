/** Structural subset of wasi:filesystem/types@0.2.12 used by the VFS implementation. */
export interface Datetime {
  seconds: bigint;

  nanoseconds: number;
}

export type DescriptorType =
  | "unknown"
  | "block-device"
  | "character-device"
  | "directory"
  | "fifo"
  | "symbolic-link"
  | "regular-file"
  | "socket";

export interface DescriptorStat {
  type: DescriptorType;

  linkCount: bigint;

  size: bigint;

  dataAccessTimestamp?: Datetime;

  dataModificationTimestamp?: Datetime;

  statusChangeTimestamp?: Datetime;
}

export interface DirectoryEntryStream {
  readDirectoryEntry(): { type: DescriptorType; name: string } | undefined;
  [Symbol.dispose](): void;
}

export interface Descriptor {
  openAt(
    pathFlags: { symlinkFollow?: boolean },
    path: string,
    openFlags: { create?: boolean; directory?: boolean; exclusive?: boolean; truncate?: boolean },
    flags: { read?: boolean; write?: boolean },
  ): Descriptor;
  read(length: bigint, offset: bigint): [Uint8Array, boolean];
  write(data: Uint8Array, offset: bigint): bigint;
  stat(): DescriptorStat;
  statAt(flags: { symlinkFollow?: boolean }, path: string): DescriptorStat;
  readDirectory(): DirectoryEntryStream;
  createDirectoryAt(path: string): void;
  removeDirectoryAt(path: string): void;
  unlinkFileAt(path: string): void;
  renameAt(path: string, destination: Descriptor, newPath: string): void;
  linkAt(
    flags: { symlinkFollow?: boolean },
    path: string,
    destination: Descriptor,
    newPath: string,
  ): void;
  readlinkAt(path: string): string;
  symlinkAt(target: string, path: string): void;
  setSize(size: bigint): void;
  setTimes(
    atime: { tag: "timestamp"; val: Datetime },
    mtime: { tag: "timestamp"; val: Datetime },
  ): void;
  setTimesAt(
    flags: { symlinkFollow?: boolean },
    path: string,
    atime: { tag: "timestamp"; val: Datetime },
    mtime: { tag: "timestamp"; val: Datetime },
  ): void;
  sync(): void;
  syncData(): void;
  [Symbol.dispose](): void;
}

export type Preopen = readonly [descriptor: Descriptor, guestPath: string];

export interface StorageRoot {
  /** Borrowed capability: the implementation never disposes the selected preopen. */
  descriptor: Descriptor;
  /** Directory relative to the preopen. Use "." for its root. Must already exist. */
  directory: string;
}

export interface WasiVfsOptions {
  preopens: { getDirectories(): Preopen[] };
  /** Called lazily, once per RealFSProvider. Memory providers never call it. */
  resolveRoot?: (rootPath: string, preopens: readonly Preopen[]) => StorageRoot;
}
