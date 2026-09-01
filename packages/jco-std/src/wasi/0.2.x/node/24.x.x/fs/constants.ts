/**
 * Linux/WASI filesystem constants observed in nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae (MIT license). Constants are
 * guest-side so merely importing `node:fs` does not consult a host provider.
 */
export const UV_FS_SYMLINK_DIR = 1;
export const UV_FS_SYMLINK_JUNCTION = 2;
export const O_RDONLY = 0;
export const O_WRONLY = 1;
export const O_RDWR = 2;
export const UV_DIRENT_UNKNOWN = 0;
export const UV_DIRENT_FILE = 1;
export const UV_DIRENT_DIR = 2;
export const UV_DIRENT_LINK = 3;
export const UV_DIRENT_FIFO = 4;
export const UV_DIRENT_SOCKET = 5;
export const UV_DIRENT_CHAR = 6;
export const UV_DIRENT_BLOCK = 7;
export const S_IFMT = 61_440;
export const S_IFREG = 32_768;
export const S_IFDIR = 16_384;
export const S_IFCHR = 8_192;
export const S_IFBLK = 24_576;
export const S_IFIFO = 4_096;
export const S_IFLNK = 40_960;
export const S_IFSOCK = 49_152;
export const O_CREAT = 64;
export const O_EXCL = 128;
export const UV_FS_O_FILEMAP = 0;
export const O_NOCTTY = 256;
export const O_TRUNC = 512;
export const O_APPEND = 1_024;
export const O_DIRECTORY = 16_384;
export const O_NOATIME = 262_144;
export const O_NOFOLLOW = 32_768;
export const O_SYNC = 1_052_672;
export const O_DSYNC = 4_096;
export const O_DIRECT = 65_536;
export const O_NONBLOCK = 2_048;
export const S_IRWXU = 448;
export const S_IRUSR = 256;
export const S_IWUSR = 128;
export const S_IXUSR = 64;
export const S_IRWXG = 56;
export const S_IRGRP = 32;
export const S_IWGRP = 16;
export const S_IXGRP = 8;
export const S_IRWXO = 7;
export const S_IROTH = 4;
export const S_IWOTH = 2;
export const S_IXOTH = 1;
export const F_OK = 0;
export const R_OK = 4;
export const W_OK = 2;
export const X_OK = 1;
export const UV_FS_COPYFILE_EXCL = 1;
export const COPYFILE_EXCL = 1;
export const UV_FS_COPYFILE_FICLONE = 2;
export const COPYFILE_FICLONE = 2;
export const UV_FS_COPYFILE_FICLONE_FORCE = 4;
export const COPYFILE_FICLONE_FORCE = 4;

export const constants = {
  UV_FS_SYMLINK_DIR,
  UV_FS_SYMLINK_JUNCTION,
  O_RDONLY,
  O_WRONLY,
  O_RDWR,
  UV_DIRENT_UNKNOWN,
  UV_DIRENT_FILE,
  UV_DIRENT_DIR,
  UV_DIRENT_LINK,
  UV_DIRENT_FIFO,
  UV_DIRENT_SOCKET,
  UV_DIRENT_CHAR,
  UV_DIRENT_BLOCK,
  S_IFMT,
  S_IFREG,
  S_IFDIR,
  S_IFCHR,
  S_IFBLK,
  S_IFIFO,
  S_IFLNK,
  S_IFSOCK,
  O_CREAT,
  O_EXCL,
  UV_FS_O_FILEMAP,
  O_NOCTTY,
  O_TRUNC,
  O_APPEND,
  O_DIRECTORY,
  O_NOATIME,
  O_NOFOLLOW,
  O_SYNC,
  O_DSYNC,
  O_DIRECT,
  O_NONBLOCK,
  S_IRWXU,
  S_IRUSR,
  S_IWUSR,
  S_IXUSR,
  S_IRWXG,
  S_IRGRP,
  S_IWGRP,
  S_IXGRP,
  S_IRWXO,
  S_IROTH,
  S_IWOTH,
  S_IXOTH,
  F_OK,
  R_OK,
  W_OK,
  X_OK,
  UV_FS_COPYFILE_EXCL,
  COPYFILE_EXCL,
  UV_FS_COPYFILE_FICLONE,
  COPYFILE_FICLONE,
  UV_FS_COPYFILE_FICLONE_FORCE,
  COPYFILE_FICLONE_FORCE,
} as const;

export default constants;
