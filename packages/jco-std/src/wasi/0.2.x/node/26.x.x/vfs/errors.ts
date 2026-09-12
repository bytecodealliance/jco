/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/errors.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: reuse portable system errors instead of the native uv binding.
 */
import { systemError, unsupportedNodeApi } from "../../24.x.x/errors/core.js";

const ERRORS = {
  ENOENT: [-2, "no such file or directory"],
  ENOTDIR: [-20, "not a directory"],
  ENOTEMPTY: [-39, "directory not empty"],
  EISDIR: [-21, "illegal operation on a directory"],
  EBADF: [-9, "bad file descriptor"],
  EEXIST: [-17, "file already exists"],
  EROFS: [-30, "read-only file system"],
  EINVAL: [-22, "invalid argument"],
  ELOOP: [-40, "too many symbolic links encountered"],
  EACCES: [-13, "permission denied"],
  EXDEV: [-18, "cross-device link not permitted"],
} as const;

export function vfsError(
  code: keyof typeof ERRORS,
  syscall: string,
  path?: string,
): Error & { code: string } {
  const [errno, description] = ERRORS[code];

  const suffix = path === undefined ? "" : ` '${path}'`;
  return systemError({
    code,
    errno,
    syscall,
    path,
    message: `${code}: ${description}, ${syscall}${suffix}`,
  });
}

export class ERR_METHOD_NOT_IMPLEMENTED extends Error {
  readonly code = "ERR_METHOD_NOT_IMPLEMENTED";

  constructor(method: string) {
    super(`The ${method} method is not implemented`);
  }
}

export class ERR_INVALID_STATE extends Error {
  readonly code = "ERR_INVALID_STATE";

  constructor(message: string) {
    super(message);
  }
}

export function unsupported(api: string): never {
  throw unsupportedNodeApi(
    `node:vfs ${api}`,
    "component VFS does not provide native filesystem hooks, streams or watchers",
  );
}
export const createENOENT = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("ENOENT", syscall, path);

export const createENOTDIR = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("ENOTDIR", syscall, path);

export const createENOTEMPTY = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("ENOTEMPTY", syscall, path);

export const createEISDIR = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EISDIR", syscall, path);

export const createEBADF = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EBADF", syscall, path);

export const createEEXIST = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EEXIST", syscall, path);

export const createEROFS = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EROFS", syscall, path);

export const createEINVAL = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EINVAL", syscall, path);

export const createELOOP = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("ELOOP", syscall, path);

export const createEACCES = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EACCES", syscall, path);

export const createEXDEV = (syscall: string, path?: string): Error & { code: string } =>
  vfsError("EXDEV", syscall, path);
