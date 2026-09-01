/**
 * Opt-in Node.js filesystem provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/fs.js and
 * lib/internal/fs/promises.js (MIT license). Each supported operation is exposed
 * as its own typed jco:node/fs WIT function.
 */
import * as nodeFs from "node:fs";
import { Buffer } from "node:buffer";

import type {
  FsCopyOptions,
  FsDirent,
  FsDirectoryEntry,
  FsError,
  FsGlobEntry,
  FsGlobOptions,
  FsHost,
  FsMkdirOptions,
  FsMode,
  FsNumeric,
  FsOpenMode,
  FsPath,
  FsPathOrDescriptor,
  FsReadFileOptions,
  FsReadResult,
  FsReadVResult,
  FsReaddirOptions,
  FsRemoveOptions,
  FsResult,
  FsStatFs,
  FsStats,
  FsWriteFileOptions,
} from "./fs/types.js";

interface FileTypeMethods {
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isDirectory(): boolean;
  isFIFO(): boolean;
  isFile(): boolean;
  isSocket(): boolean;
  isSymbolicLink(): boolean;
}

const STATS_FIELDS = [
  "dev",
  "ino",
  "mode",
  "nlink",
  "uid",
  "gid",
  "rdev",
  "size",
  "blksize",
  "blocks",
  "atimeMs",
  "mtimeMs",
  "ctimeMs",
  "birthtimeMs",
] as const;

const STATFS_FIELDS = ["type", "bsize", "blocks", "bfree", "bavail", "files", "ffree"] as const;

function ok<T>(val: T): FsResult<T> {
  return { tag: "ok", val };
}

function serializeError(error: unknown): FsError {
  const value =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const errno =
    typeof value.errno === "number"
      ? { tag: "number" as const, val: BigInt(value.errno) }
      : typeof value.errno === "string"
        ? { tag: "symbolic" as const, val: value.errno }
        : undefined;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    errno,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    path: typeof value.path === "string" ? value.path : undefined,
    dest: typeof value.dest === "string" ? value.dest : undefined,
  };
}

function capture<T>(operation: () => T): FsResult<T> {
  try {
    return ok(operation());
  } catch (error) {
    return { tag: "err", val: serializeError(error) };
  }
}

function path(value: FsPath): string | Buffer | URL {
  switch (value.tag) {
    case "text":
      return value.val;
    case "bytes":
      return Buffer.from(value.val);
    case "file-url":
      return new URL(value.val);
  }
}

function pathOrDescriptor(value: FsPathOrDescriptor): string | Buffer | URL | number {
  return value.tag === "descriptor" ? value.val : path(value.val);
}

function mode(value: FsMode): number | string {
  return value.val;
}

function openMode(value: FsOpenMode): number | string {
  return value.val;
}

function numeric(value: number | bigint): FsNumeric {
  return typeof value === "bigint" ? { tag: "bigint", val: value } : { tag: "number", val: value };
}

function fileType(value: FileTypeMethods): FsStats["fileType"] {
  if (value.isFile()) {
    return "file";
  }
  if (value.isDirectory()) {
    return "directory";
  }
  if (value.isSymbolicLink()) {
    return "symlink";
  }
  if (value.isBlockDevice()) {
    return "block";
  }
  if (value.isCharacterDevice()) {
    return "character";
  }
  if (value.isFIFO()) {
    return "fifo";
  }
  if (value.isSocket()) {
    return "socket";
  }
  return "unknown";
}

function stats(value: nodeFs.Stats | nodeFs.BigIntStats): FsStats {
  const result = {} as Record<(typeof STATS_FIELDS)[number], FsNumeric>;
  for (const field of STATS_FIELDS) {
    result[field] = numeric(value[field]);
  }
  const bigint = value as nodeFs.BigIntStats;
  return {
    ...result,
    atimeNs: typeof bigint.atimeNs === "bigint" ? bigint.atimeNs : undefined,
    mtimeNs: typeof bigint.mtimeNs === "bigint" ? bigint.mtimeNs : undefined,
    ctimeNs: typeof bigint.ctimeNs === "bigint" ? bigint.ctimeNs : undefined,
    birthtimeNs: typeof bigint.birthtimeNs === "bigint" ? bigint.birthtimeNs : undefined,
    fileType: fileType(value),
  };
}

function statfsRecord(value: nodeFs.StatsFs | nodeFs.BigIntStatsFs): FsStatFs {
  const result = {} as Record<(typeof STATFS_FIELDS)[number], FsNumeric>;
  for (const field of STATFS_FIELDS) {
    result[field] = numeric(value[field]);
  }
  return result;
}

function dirent(value: nodeFs.Dirent): FsDirent {
  return {
    name: String(value.name),
    parentPath: value.parentPath,
    fileType: fileType(value),
  };
}

function writeFileOptions(options: FsWriteFileOptions): nodeFs.WriteFileOptions {
  return {
    encoding: null,
    flag: options.flag,
    mode: options.mode ? mode(options.mode) : undefined,
    flush: options.flush,
  };
}

export const access: FsHost["access"] = (value, accessMode) =>
  capture(() => nodeFs.accessSync(path(value), accessMode));

export const appendFile: FsHost["appendFile"] = (file, data, options) =>
  capture(() => nodeFs.appendFileSync(pathOrDescriptor(file), data, writeFileOptions(options)));

export const chmod: FsHost["chmod"] = (value, valueMode) =>
  capture(() => nodeFs.chmodSync(path(value), mode(valueMode)));

export const chown: FsHost["chown"] = (value, uid, gid) =>
  capture(() => nodeFs.chownSync(path(value), uid, gid));

export const close: FsHost["close"] = (descriptor) => capture(() => nodeFs.closeSync(descriptor));

export const copyFile: FsHost["copyFile"] = (source, destination, copyMode) =>
  capture(() => nodeFs.copyFileSync(path(source), path(destination), copyMode));

export const cp: FsHost["cp"] = (source, destination, options: FsCopyOptions) =>
  capture(() =>
    nodeFs.cpSync(String(path(source)), String(path(destination)), {
      dereference: options.dereference,
      errorOnExist: options.errorOnExist,
      force: options.force,
      preserveTimestamps: options.preserveTimestamps,
      recursive: options.recursive,
      verbatimSymlinks: options.verbatimSymlinks,
    }),
  );

export const exists: FsHost["exists"] = (value) => capture(() => nodeFs.existsSync(path(value)));

export const fchmod: FsHost["fchmod"] = (descriptor, valueMode) =>
  capture(() => nodeFs.fchmodSync(descriptor, mode(valueMode)));

export const fchown: FsHost["fchown"] = (descriptor, uid, gid) =>
  capture(() => nodeFs.fchownSync(descriptor, uid, gid));

export const fdatasync: FsHost["fdatasync"] = (descriptor) =>
  capture(() => nodeFs.fdatasyncSync(descriptor));

export const fstat: FsHost["fstat"] = (descriptor, options) =>
  capture(() =>
    stats(
      options.bigint
        ? nodeFs.fstatSync(descriptor, { bigint: true })
        : nodeFs.fstatSync(descriptor, { bigint: false }),
    ),
  );

export const fsync: FsHost["fsync"] = (descriptor) => capture(() => nodeFs.fsyncSync(descriptor));

export const ftruncate: FsHost["ftruncate"] = (descriptor, length) =>
  capture(() => nodeFs.ftruncateSync(descriptor, length));

export const futimes: FsHost["futimes"] = (descriptor, atime, mtime) =>
  capture(() => nodeFs.futimesSync(descriptor, atime, mtime));

export const glob: FsHost["glob"] = (patterns, options: FsGlobOptions) =>
  capture(() => {
    const exclude =
      options.exclude?.tag === "pattern"
        ? [options.exclude.val]
        : options.exclude?.tag === "patterns"
          ? options.exclude.val
          : undefined;
    const cwd = options.cwd ? String(path(options.cwd)) : undefined;
    if (options.withFileTypes) {
      return nodeFs
        .globSync(patterns, { cwd, exclude, withFileTypes: true })
        .map((entry): FsGlobEntry => ({ tag: "dirent", val: dirent(entry) }));
    }
    return nodeFs
      .globSync(patterns, { cwd, exclude, withFileTypes: false })
      .map((entry): FsGlobEntry => ({ tag: "path", val: entry }));
  });

export const lchown: FsHost["lchown"] = (value, uid, gid) =>
  capture(() => nodeFs.lchownSync(path(value), uid, gid));

export const link: FsHost["link"] = (existingPath, newPath) =>
  capture(() => nodeFs.linkSync(path(existingPath), path(newPath)));

export const lstat: FsHost["lstat"] = (value, options) =>
  capture(() => {
    const result = options.bigint
      ? nodeFs.lstatSync(path(value), {
          bigint: true,
          throwIfNoEntry: options.throwIfNoEntry,
        })
      : nodeFs.lstatSync(path(value), {
          bigint: false,
          throwIfNoEntry: options.throwIfNoEntry,
        });
    return result === undefined ? undefined : stats(result);
  });

export const lutimes: FsHost["lutimes"] = (value, atime, mtime) =>
  capture(() => nodeFs.lutimesSync(path(value), atime, mtime));

export const mkdir: FsHost["mkdir"] = (value, options: FsMkdirOptions) =>
  capture(() => {
    const result = nodeFs.mkdirSync(path(value), {
      recursive: options.recursive,
      mode: options.mode ? mode(options.mode) : undefined,
    });
    return result === undefined ? undefined : String(result);
  });

export const mkdtemp: FsHost["mkdtemp"] = (prefix) =>
  capture(() => nodeFs.mkdtempSync(prefix, { encoding: "utf8" }));

export const open: FsHost["open"] = (value, flags, valueMode) =>
  capture(() => nodeFs.openSync(path(value), openMode(flags), mode(valueMode)));

export const readFile: FsHost["readFile"] = (file, options: FsReadFileOptions) =>
  capture(() =>
    nodeFs.readFileSync(pathOrDescriptor(file), {
      encoding: null,
      flag: options.flag,
    }),
  );

export const readdir: FsHost["readdir"] = (value, options: FsReaddirOptions) =>
  capture(() => {
    if (options.withFileTypes) {
      return nodeFs
        .readdirSync(path(value), {
          encoding: "utf8",
          recursive: options.recursive,
          withFileTypes: true,
        })
        .map((entry): FsDirectoryEntry => ({ tag: "dirent", val: dirent(entry) }));
    }
    return nodeFs
      .readdirSync(path(value), {
        encoding: "utf8",
        recursive: options.recursive,
        withFileTypes: false,
      })
      .map((entry): FsDirectoryEntry => ({ tag: "name", val: entry }));
  });

export const readlink: FsHost["readlink"] = (value) =>
  capture(() => nodeFs.readlinkSync(path(value), { encoding: "utf8" }));

export const realpath: FsHost["realpath"] = (value) =>
  capture(() => nodeFs.realpathSync(path(value), { encoding: "utf8" }));

export const rename: FsHost["rename"] = (oldPath, newPath) =>
  capture(() => nodeFs.renameSync(path(oldPath), path(newPath)));

export const rm: FsHost["rm"] = (value, options: FsRemoveOptions) =>
  capture(() => nodeFs.rmSync(path(value), options));

export const rmdir: FsHost["rmdir"] = (value, options: FsRemoveOptions) =>
  capture(() =>
    nodeFs.rmdirSync(path(value), {
      maxRetries: options.maxRetries,
      recursive: false,
      retryDelay: options.retryDelay,
    }),
  );

export const stat: FsHost["stat"] = (value, options) =>
  capture(() => {
    const result = options.bigint
      ? nodeFs.statSync(path(value), {
          bigint: true,
          throwIfNoEntry: options.throwIfNoEntry,
        })
      : nodeFs.statSync(path(value), {
          bigint: false,
          throwIfNoEntry: options.throwIfNoEntry,
        });
    return result === undefined ? undefined : stats(result);
  });

export const statfs: FsHost["statfs"] = (value, bigint) =>
  capture(() =>
    statfsRecord(
      bigint
        ? nodeFs.statfsSync(path(value), { bigint: true })
        : nodeFs.statfsSync(path(value), { bigint: false }),
    ),
  );

export const symlink: FsHost["symlink"] = (target, value, type) =>
  capture(() => {
    if (type !== undefined && type !== "dir" && type !== "file" && type !== "junction") {
      throw new TypeError(`invalid symlink type: ${type}`);
    }
    nodeFs.symlinkSync(path(target), path(value), type);
  });

export const truncate: FsHost["truncate"] = (value, length) =>
  capture(() => nodeFs.truncateSync(path(value), length));

export const unlink: FsHost["unlink"] = (value) => capture(() => nodeFs.unlinkSync(path(value)));

export const utimes: FsHost["utimes"] = (value, atime, mtime) =>
  capture(() => nodeFs.utimesSync(path(value), atime, mtime));

export const writeFile: FsHost["writeFile"] = (file, data, options) =>
  capture(() => nodeFs.writeFileSync(pathOrDescriptor(file), data, writeFileOptions(options)));

export const read: FsHost["read"] = (descriptor, length, position) =>
  capture((): FsReadResult => {
    const data = new Uint8Array(length);
    const bytesRead = nodeFs.readSync(
      descriptor,
      data,
      0,
      length,
      position === undefined ? null : Number(position),
    );
    return { bytesRead, data: data.subarray(0, bytesRead) };
  });

export const write: FsHost["write"] = (descriptor, data, position) =>
  capture(() =>
    nodeFs.writeSync(
      descriptor,
      data,
      0,
      data.byteLength,
      position === undefined ? null : Number(position),
    ),
  );

export const readv: FsHost["readv"] = (descriptor, lengths, position) =>
  capture((): FsReadVResult => {
    const buffers = lengths.map((length) => new Uint8Array(length));
    const bytesRead = nodeFs.readvSync(
      descriptor,
      buffers,
      position === undefined ? undefined : Number(position),
    );
    return { bytesRead, buffers };
  });

export const writev: FsHost["writev"] = (descriptor, buffers, position) =>
  capture(() =>
    nodeFs.writevSync(descriptor, buffers, position === undefined ? undefined : Number(position)),
  );

const host: FsHost = {
  access,
  appendFile,
  chmod,
  chown,
  close,
  copyFile,
  cp,
  exists,
  fchmod,
  fchown,
  fdatasync,
  fstat,
  fsync,
  ftruncate,
  futimes,
  glob,
  lchown,
  link,
  lstat,
  lutimes,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  symlink,
  truncate,
  unlink,
  utimes,
  writeFile,
  read,
  write,
  readv,
  writev,
};

export default host;
