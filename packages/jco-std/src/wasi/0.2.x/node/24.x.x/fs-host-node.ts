/**
 * Opt-in Node.js filesystem provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/fs.js and
 * lib/internal/fs/promises.js (MIT license). Local code replaces Node's native
 * binding requests with the host-neutral jco:node/fs JSON protocol.
 */
import * as nodeFs from "node:fs";

import { parseRequest, serializeFailure, serializeSuccess } from "./fs/protocol.js";
import type { FsHostQuery, FsWireDirent, FsWireError, FsWireStats } from "./fs/types.js";

type HostFunction = (...args: unknown[]) => unknown;

const SYNC_OPERATIONS = new Set([
  "access",
  "appendFile",
  "chmod",
  "chown",
  "close",
  "copyFile",
  "cp",
  "exists",
  "fchmod",
  "fchown",
  "fdatasync",
  "fstat",
  "fsync",
  "ftruncate",
  "futimes",
  "glob",
  "lchown",
  "link",
  "lstat",
  "lutimes",
  "mkdir",
  "mkdtemp",
  "open",
  "readFile",
  "readdir",
  "readlink",
  "realpath",
  "rename",
  "rm",
  "rmdir",
  "stat",
  "statfs",
  "symlink",
  "truncate",
  "unlink",
  "utimes",
  "writeFile",
]);

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
  "atimeNs",
  "mtimeNs",
  "ctimeNs",
  "birthtimeNs",
  "atime",
  "mtime",
  "ctime",
  "birthtime",
] as const;

interface FileTypeMethods {
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isDirectory(): boolean;
  isFIFO(): boolean;
  isFile(): boolean;
  isSocket(): boolean;
  isSymbolicLink(): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFileTypeMethods(value: unknown): value is FileTypeMethods {
  if (!isRecord(value)) {
    return false;
  }
  return [
    "isBlockDevice",
    "isCharacterDevice",
    "isDirectory",
    "isFIFO",
    "isFile",
    "isSocket",
    "isSymbolicLink",
  ].every((name) => typeof value[name] === "function");
}

function fileType(value: FileTypeMethods): FsWireStats["fileType"] {
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

function normalizeHostValue(value: unknown): unknown {
  if (value instanceof nodeFs.Dirent) {
    const dirent: FsWireDirent = {
      __jcoNodeFs: "dirent",
      name: value.name,
      parentPath: value.parentPath,
      fileType: fileType(value),
    };
    return dirent;
  }
  if (value instanceof nodeFs.Stats || (hasFileTypeMethods(value) && "atimeMs" in value)) {
    const values: Record<string, unknown> = {};
    for (const field of STATS_FIELDS) {
      values[field] = Reflect.get(value, field);
    }
    const stats: FsWireStats = {
      __jcoNodeFs: "stats",
      values,
      fileType: fileType(value),
    };
    return stats;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeHostValue);
  }
  if (
    isRecord(value) &&
    !(value instanceof Date) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeHostValue(entry)]),
    );
  }
  return value;
}

function serializeError(error: unknown): FsWireError {
  const value = isRecord(error) ? error : {};
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    errno:
      typeof value.errno === "number" || typeof value.errno === "string" ? value.errno : undefined,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    path: typeof value.path === "string" ? value.path : undefined,
    dest: typeof value.dest === "string" ? value.dest : undefined,
  };
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  return value as number;
}

function position(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return integer(value, "position");
}

function optionalPosition(value: unknown): number | undefined {
  return position(value) ?? undefined;
}

function bytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be bytes`);
  }
  return value;
}

function byteArrays(value: unknown): Uint8Array[] {
  if (!Array.isArray(value)) {
    throw new TypeError("buffers must be an array");
  }
  return value.map((entry, index) => bytes(entry, `buffers[${index}]`));
}

function invokeSpecial(operation: string, args: unknown[]): unknown {
  if (operation === "read") {
    const fd = integer(args[0], "fd");
    const length = integer(args[1], "length");
    const buffer = new Uint8Array(length);
    const bytesRead = nodeFs.readSync(fd, buffer, 0, length, position(args[2]));
    return { bytesRead, data: buffer.subarray(0, bytesRead) };
  }
  if (operation === "write") {
    const data = bytes(args[1], "data");
    return nodeFs.writeSync(integer(args[0], "fd"), data, 0, data.byteLength, position(args[2]));
  }
  if (operation === "readv") {
    const buffers = (args[1] as unknown[]).map(
      (length, index) => new Uint8Array(integer(length, `lengths[${index}]`)),
    );
    const bytesRead = nodeFs.readvSync(integer(args[0], "fd"), buffers, optionalPosition(args[2]));
    return { bytesRead, buffers };
  }
  if (operation === "writev") {
    return nodeFs.writevSync(
      integer(args[0], "fd"),
      byteArrays(args[1]),
      optionalPosition(args[2]),
    );
  }
  return undefined;
}

function invoke(operation: string, args: unknown[]): unknown {
  if (["read", "write", "readv", "writev"].includes(operation)) {
    return invokeSpecial(operation, args);
  }
  if (!SYNC_OPERATIONS.has(operation)) {
    const error = new Error(`unsupported filesystem host operation: ${operation}`) as Error & {
      code: string;
    };
    error.code = "ERR_JCO_UNSUPPORTED_NODE_API";
    throw error;
  }
  const candidate: unknown = Reflect.get(nodeFs, `${operation}Sync`);
  if (typeof candidate !== "function") {
    throw new TypeError(`Node does not provide fs.${operation}Sync`);
  }
  return Reflect.apply(candidate as HostFunction, nodeFs, args);
}

/** Delegate one validated filesystem request to Node's real synchronous API. */
export const query: FsHostQuery = (requestJson) => {
  try {
    const request = parseRequest(requestJson);
    return serializeSuccess(normalizeHostValue(invoke(request.operation, request.args)));
  } catch (error) {
    return serializeFailure(serializeError(error));
  }
};

export default { query };
