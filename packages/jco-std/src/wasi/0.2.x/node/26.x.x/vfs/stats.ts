/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/stats.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Reconstruct existing portable Stats instead of calling getStatsFromBinding.
 */
import { Stats } from "../../24.x.x/fs/classes.js";
import type { FsNumeric, FsFileType } from "../../24.x.x/fs/types.js";
import type { FileStats } from "./types.js";

interface StatValues {
  mode?: number;

  nlink?: number;

  uid?: number;

  gid?: number;

  atimeMs?: number;

  mtimeMs?: number;

  ctimeMs?: number;

  birthtimeMs?: number;

  bigint?: boolean;
}

let nextInode = 1;

function createStats(
  size: number,
  fileType: FsFileType,
  mode: number,
  options: StatValues,
): FileStats {
  const now = Date.now();

  const numeric = (value: number): FsNumeric =>
    options.bigint
      ? { tag: "bigint", val: BigInt(Math.trunc(value)) }
      : { tag: "number", val: value };
  const time = (value: number | undefined): number => value ?? now;

  const nanos = (value: number | undefined): bigint | undefined =>
    options.bigint ? BigInt(Math.trunc(time(value) * 1e6)) : undefined;

  return new Stats({
    dev: numeric(4085),
    ino: numeric(nextInode++),
    mode: numeric(mode | (options.mode ?? (fileType === "directory" ? 0o755 : 0o644))),
    nlink: numeric(options.nlink ?? 1),
    uid: numeric(options.uid ?? 0),
    gid: numeric(options.gid ?? 0),
    rdev: numeric(0),
    size: numeric(size),
    blksize: numeric(4096),
    blocks: numeric(Math.ceil(size / 512)),
    atimeMs: numeric(time(options.atimeMs)),
    mtimeMs: numeric(time(options.mtimeMs)),
    ctimeMs: numeric(time(options.ctimeMs)),
    birthtimeMs: numeric(time(options.birthtimeMs)),
    atimeNs: nanos(options.atimeMs),
    mtimeNs: nanos(options.mtimeMs),
    ctimeNs: nanos(options.ctimeMs),
    birthtimeNs: nanos(options.birthtimeMs),
    fileType,
  });
}

export function createFileStats(size: number, options: StatValues = {}): FileStats {
  return createStats(size, "file", 0o100000, options);
}

export function createDirectoryStats(options: StatValues = {}): FileStats {
  return createStats(4096, "directory", 0o40000, options);
}

export function createSymlinkStats(size: number, options: StatValues = {}): FileStats {
  return createStats(size, "symlink", 0o120000, options);
}
