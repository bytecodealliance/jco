import type { FsStats, FsNumeric, FsFileType } from "../../24.x.x/fs/types.js";
import type { Datetime, DescriptorStat, DescriptorType } from "./wasi-types.js";

export function fileType(type: DescriptorType): FsFileType {
  switch (type) {
    case "regular-file":
      return "file";
    case "symbolic-link":
      return "symlink";
    case "block-device":
      return "block";
    case "character-device":
      return "character";
    default:
      return type;
  }
}

export function wasiStats(stat: DescriptorStat, bigint: boolean): FsStats {
  const numeric = (value: number | bigint): FsNumeric =>
    bigint ? { tag: "bigint", val: BigInt(value) } : { tag: "number", val: Number(value) };
  const nanos = (value?: Datetime): bigint =>
    value ? value.seconds * 1_000_000_000n + BigInt(value.nanoseconds) : 0n;
  const millis = (value?: Datetime): FsNumeric =>
    bigint ? numeric(nanos(value) / 1_000_000n) : numeric(Number(nanos(value)) / 1e6);
  const mode =
    stat.type === "directory" ? 0o40755 : stat.type === "symbolic-link" ? 0o120777 : 0o100644;
  return {
    dev: numeric(0),
    ino: numeric(0),
    mode: numeric(mode),
    nlink: numeric(stat.linkCount),
    uid: numeric(0),
    gid: numeric(0),
    rdev: numeric(0),
    size: numeric(stat.size),
    blksize: numeric(4096),
    blocks: numeric((stat.size + 511n) / 512n),
    atimeMs: millis(stat.dataAccessTimestamp),
    mtimeMs: millis(stat.dataModificationTimestamp),
    ctimeMs: millis(stat.statusChangeTimestamp),
    birthtimeMs: numeric(0),
    atimeNs: bigint ? nanos(stat.dataAccessTimestamp) : undefined,
    mtimeNs: bigint ? nanos(stat.dataModificationTimestamp) : undefined,
    ctimeNs: bigint ? nanos(stat.statusChangeTimestamp) : undefined,
    birthtimeNs: bigint ? 0n : undefined,
    fileType: fileType(stat.type),
  };
}
