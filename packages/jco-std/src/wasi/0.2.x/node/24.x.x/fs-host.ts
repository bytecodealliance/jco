import type { FsHost } from "./fs/types.js";
import { denyThrow } from "./internal/deny-host.js";

/**
 * The default adapter intentionally grants no filesystem capability. Applications must map
 * `jco:node/fs@0.1.0` to a host implementation, such as the separately exported Node adapter.
 */
const deny = denyThrow(
  "ERR_JCO_FS_ADAPTER_REQUIRED",
  "node:fs requires an explicitly configured filesystem host provider",
);

export const access: FsHost["access"] = deny;

export const appendFile: FsHost["appendFile"] = deny;

export const chmod: FsHost["chmod"] = deny;

export const chown: FsHost["chown"] = deny;

export const close: FsHost["close"] = deny;

export const copyFile: FsHost["copyFile"] = deny;

export const cp: FsHost["cp"] = deny;

export const exists: FsHost["exists"] = deny;

export const fchmod: FsHost["fchmod"] = deny;

export const fchown: FsHost["fchown"] = deny;

export const fdatasync: FsHost["fdatasync"] = deny;

export const fstat: FsHost["fstat"] = deny;

export const fsync: FsHost["fsync"] = deny;

export const ftruncate: FsHost["ftruncate"] = deny;

export const futimes: FsHost["futimes"] = deny;

export const glob: FsHost["glob"] = deny;

export const lchown: FsHost["lchown"] = deny;

export const link: FsHost["link"] = deny;

export const lstat: FsHost["lstat"] = deny;

export const lutimes: FsHost["lutimes"] = deny;

export const mkdir: FsHost["mkdir"] = deny;

export const mkdtemp: FsHost["mkdtemp"] = deny;

export const open: FsHost["open"] = deny;

export const readFile: FsHost["readFile"] = deny;

export const readdir: FsHost["readdir"] = deny;

export const readlink: FsHost["readlink"] = deny;

export const realpath: FsHost["realpath"] = deny;

export const rename: FsHost["rename"] = deny;

export const rm: FsHost["rm"] = deny;

export const rmdir: FsHost["rmdir"] = deny;

export const stat: FsHost["stat"] = deny;

export const statfs: FsHost["statfs"] = deny;

export const symlink: FsHost["symlink"] = deny;

export const truncate: FsHost["truncate"] = deny;

export const unlink: FsHost["unlink"] = deny;

export const utimes: FsHost["utimes"] = deny;

export const writeFile: FsHost["writeFile"] = deny;

export const read: FsHost["read"] = deny;

export const write: FsHost["write"] = deny;

export const readv: FsHost["readv"] = deny;

export const writev: FsHost["writev"] = deny;

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
