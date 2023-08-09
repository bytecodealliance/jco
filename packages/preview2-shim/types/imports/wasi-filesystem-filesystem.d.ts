export namespace WasiFilesystemFilesystem {
  /**
   * Return a stream for reading from a file.
   * 
   * Multiple read, write, and append streams may be active on the same open
   * file and they do not interfere with each other.
   * 
   * Note: This allows using `wasi:io/streams.read`, which is similar to `read` in POSIX.
   */
  export function readViaStream(this: Descriptor, offset: Filesize): InputStream;
  /**
   * Return a stream for writing to a file.
   * 
   * Note: This allows using `wasi:io/streams.write`, which is similar to `write` in
   * POSIX.
   */
  export function writeViaStream(this: Descriptor, offset: Filesize): OutputStream;
  /**
   * Return a stream for appending to a file.
   * 
   * Note: This allows using `wasi:io/streams.write`, which is similar to `write` with
   * `O_APPEND` in in POSIX.
   */
  export function appendViaStream(this: Descriptor): OutputStream;
  /**
   * Provide file advisory information on a descriptor.
   * 
   * This is similar to `posix_fadvise` in POSIX.
   */
  export function advise(this: Descriptor, offset: Filesize, length: Filesize, advice: Advice): void;
  /**
   * Synchronize the data of a file to disk.
   * 
   * This function succeeds with no effect if the file descriptor is not
   * opened for writing.
   * 
   * Note: This is similar to `fdatasync` in POSIX.
   */
  export function syncData(this: Descriptor): void;
  /**
   * Get flags associated with a descriptor.
   * 
   * Note: This returns similar flags to `fcntl(fd, F_GETFL)` in POSIX.
   * 
   * Note: This returns the value that was the `fs_flags` value returned
   * from `fdstat_get` in earlier versions of WASI.
   */
  export function getFlags(this: Descriptor): DescriptorFlags;
  /**
   * Get the dynamic type of a descriptor.
   * 
   * Note: This returns the same value as the `type` field of the `fd-stat`
   * returned by `stat`, `stat-at` and similar.
   * 
   * Note: This returns similar flags to the `st_mode & S_IFMT` value provided
   * by `fstat` in POSIX.
   * 
   * Note: This returns the value that was the `fs_filetype` value returned
   * from `fdstat_get` in earlier versions of WASI.
   */
  export function getType(this: Descriptor): DescriptorType;
  /**
   * Adjust the size of an open file. If this increases the file's size, the
   * extra bytes are filled with zeros.
   * 
   * Note: This was called `fd_filestat_set_size` in earlier versions of WASI.
   */
  export function setSize(this: Descriptor, size: Filesize): void;
  /**
   * Adjust the timestamps of an open file or directory.
   * 
   * Note: This is similar to `futimens` in POSIX.
   * 
   * Note: This was called `fd_filestat_set_times` in earlier versions of WASI.
   */
  export function setTimes(this: Descriptor, dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): void;
  /**
   * Read from a descriptor, without using and updating the descriptor's offset.
   * 
   * This function returns a list of bytes containing the data that was
   * read, along with a bool which, when true, indicates that the end of the
   * file was reached. The returned list will contain up to `length` bytes; it
   * may return fewer than requested, if the end of the file is reached or
   * if the I/O operation is interrupted.
   * 
   * In the future, this may change to return a `stream<u8, error-code>`.
   * 
   * Note: This is similar to `pread` in POSIX.
   */
  export function read(this: Descriptor, length: Filesize, offset: Filesize): [Uint8Array | ArrayBuffer, boolean];
  /**
   * Write to a descriptor, without using and updating the descriptor's offset.
   * 
   * It is valid to write past the end of a file; the file is extended to the
   * extent of the write, with bytes between the previous end and the start of
   * the write set to zero.
   * 
   * In the future, this may change to take a `stream<u8, error-code>`.
   * 
   * Note: This is similar to `pwrite` in POSIX.
   */
  export function write(this: Descriptor, buffer: Uint8Array, offset: Filesize): Filesize;
  /**
   * Read directory entries from a directory.
   * 
   * On filesystems where directories contain entries referring to themselves
   * and their parents, often named `.` and `..` respectively, these entries
   * are omitted.
   * 
   * This always returns a new stream which starts at the beginning of the
   * directory. Multiple streams may be active on the same directory, and they
   * do not interfere with each other.
   */
  export function readDirectory(this: Descriptor): DirectoryEntryStream;
  /**
   * Synchronize the data and metadata of a file to disk.
   * 
   * This function succeeds with no effect if the file descriptor is not
   * opened for writing.
   * 
   * Note: This is similar to `fsync` in POSIX.
   */
  export function sync(this: Descriptor): void;
  /**
   * Create a directory.
   * 
   * Note: This is similar to `mkdirat` in POSIX.
   */
  export function createDirectoryAt(this: Descriptor, path: string): void;
  /**
   * Return the attributes of an open file or directory.
   * 
   * Note: This is similar to `fstat` in POSIX.
   * 
   * Note: This was called `fd_filestat_get` in earlier versions of WASI.
   */
  export function stat(this: Descriptor): DescriptorStat;
  /**
   * Return the attributes of a file or directory.
   * 
   * Note: This is similar to `fstatat` in POSIX.
   * 
   * Note: This was called `path_filestat_get` in earlier versions of WASI.
   */
  export function statAt(this: Descriptor, pathFlags: PathFlags, path: string): DescriptorStat;
  /**
   * Adjust the timestamps of a file or directory.
   * 
   * Note: This is similar to `utimensat` in POSIX.
   * 
   * Note: This was called `path_filestat_set_times` in earlier versions of
   * WASI.
   */
  export function setTimesAt(this: Descriptor, pathFlags: PathFlags, path: string, dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): void;
  /**
   * Create a hard link.
   * 
   * Note: This is similar to `linkat` in POSIX.
   */
  export function linkAt(this: Descriptor, oldPathFlags: PathFlags, oldPath: string, newDescriptor: Descriptor, newPath: string): void;
  /**
   * Open a file or directory.
   * 
   * The returned descriptor is not guaranteed to be the lowest-numbered
   * descriptor not currently open/ it is randomized to prevent applications
   * from depending on making assumptions about indexes, since this is
   * error-prone in multi-threaded contexts. The returned descriptor is
   * guaranteed to be less than 2**31.
   * 
   * If `flags` contains `descriptor-flags::mutate-directory`, and the base
   * descriptor doesn't have `descriptor-flags::mutate-directory` set,
   * `open-at` fails with `error-code::read-only`.
   * 
   * If `flags` contains `write` or `mutate-directory`, or `open-flags`
   * contains `truncate` or `create`, and the base descriptor doesn't have
   * `descriptor-flags::mutate-directory` set, `open-at` fails with
   * `error-code::read-only`.
   * 
   * Note: This is similar to `openat` in POSIX.
   */
  export function openAt(this: Descriptor, pathFlags: PathFlags, path: string, openFlags: OpenFlags, flags: DescriptorFlags, modes: Modes): Descriptor;
  /**
   * Read the contents of a symbolic link.
   * 
   * If the contents contain an absolute or rooted path in the underlying
   * filesystem, this function fails with `error-code::not-permitted`.
   * 
   * Note: This is similar to `readlinkat` in POSIX.
   */
  export function readlinkAt(this: Descriptor, path: string): string;
  /**
   * Remove a directory.
   * 
   * Return `error-code::not-empty` if the directory is not empty.
   * 
   * Note: This is similar to `unlinkat(fd, path, AT_REMOVEDIR)` in POSIX.
   */
  export function removeDirectoryAt(this: Descriptor, path: string): void;
  /**
   * Rename a filesystem object.
   * 
   * Note: This is similar to `renameat` in POSIX.
   */
  export function renameAt(this: Descriptor, oldPath: string, newDescriptor: Descriptor, newPath: string): void;
  /**
   * Create a symbolic link (also known as a "symlink").
   * 
   * If `old-path` starts with `/`, the function fails with
   * `error-code::not-permitted`.
   * 
   * Note: This is similar to `symlinkat` in POSIX.
   */
  export function symlinkAt(this: Descriptor, oldPath: string, newPath: string): void;
  /**
   * Check accessibility of a filesystem path.
   * 
   * Check whether the given filesystem path names an object which is
   * readable, writable, or executable, or whether it exists.
   * 
   * This does not a guarantee that subsequent accesses will succeed, as
   * filesystem permissions may be modified asynchronously by external
   * entities.
   * 
   * Note: This is similar to `faccessat` with the `AT_EACCESS` flag in POSIX.
   */
  export function accessAt(this: Descriptor, pathFlags: PathFlags, path: string, type: AccessType): void;
  /**
   * Unlink a filesystem object that is not a directory.
   * 
   * Return `error-code::is-directory` if the path refers to a directory.
   * Note: This is similar to `unlinkat(fd, path, 0)` in POSIX.
   */
  export function unlinkFileAt(this: Descriptor, path: string): void;
  /**
   * Change the permissions of a filesystem object that is not a directory.
   * 
   * Note that the ultimate meanings of these permissions is
   * filesystem-specific.
   * 
   * Note: This is similar to `fchmodat` in POSIX.
   */
  export function changeFilePermissionsAt(this: Descriptor, pathFlags: PathFlags, path: string, modes: Modes): void;
  /**
   * Change the permissions of a directory.
   * 
   * Note that the ultimate meanings of these permissions is
   * filesystem-specific.
   * 
   * Unlike in POSIX, the `executable` flag is not reinterpreted as a "search"
   * flag. `read` on a directory implies readability and searchability, and
   * `execute` is not valid for directories.
   * 
   * Note: This is similar to `fchmodat` in POSIX.
   */
  export function changeDirectoryPermissionsAt(this: Descriptor, pathFlags: PathFlags, path: string, modes: Modes): void;
  /**
   * Request a shared advisory lock for an open file.
   * 
   * This requests a *shared* lock; more than one shared lock can be held for
   * a file at the same time.
   * 
   * If the open file has an exclusive lock, this function downgrades the lock
   * to a shared lock. If it has a shared lock, this function has no effect.
   * 
   * This requests an *advisory* lock, meaning that the file could be accessed
   * by other programs that don't hold the lock.
   * 
   * It is unspecified how shared locks interact with locks acquired by
   * non-WASI programs.
   * 
   * This function blocks until the lock can be acquired.
   * 
   * Not all filesystems support locking; on filesystems which don't support
   * locking, this function returns `error-code::unsupported`.
   * 
   * Note: This is similar to `flock(fd, LOCK_SH)` in Unix.
   */
  export function lockShared(this: Descriptor): void;
  /**
   * Request an exclusive advisory lock for an open file.
   * 
   * This requests an *exclusive* lock; no other locks may be held for the
   * file while an exclusive lock is held.
   * 
   * If the open file has a shared lock and there are no exclusive locks held
   * for the file, this function upgrades the lock to an exclusive lock. If the
   * open file already has an exclusive lock, this function has no effect.
   * 
   * This requests an *advisory* lock, meaning that the file could be accessed
   * by other programs that don't hold the lock.
   * 
   * It is unspecified whether this function succeeds if the file descriptor
   * is not opened for writing. It is unspecified how exclusive locks interact
   * with locks acquired by non-WASI programs.
   * 
   * This function blocks until the lock can be acquired.
   * 
   * Not all filesystems support locking; on filesystems which don't support
   * locking, this function returns `error-code::unsupported`.
   * 
   * Note: This is similar to `flock(fd, LOCK_EX)` in Unix.
   */
  export function lockExclusive(this: Descriptor): void;
  /**
   * Request a shared advisory lock for an open file.
   * 
   * This requests a *shared* lock; more than one shared lock can be held for
   * a file at the same time.
   * 
   * If the open file has an exclusive lock, this function downgrades the lock
   * to a shared lock. If it has a shared lock, this function has no effect.
   * 
   * This requests an *advisory* lock, meaning that the file could be accessed
   * by other programs that don't hold the lock.
   * 
   * It is unspecified how shared locks interact with locks acquired by
   * non-WASI programs.
   * 
   * This function returns `error-code::would-block` if the lock cannot be
   * acquired.
   * 
   * Not all filesystems support locking; on filesystems which don't support
   * locking, this function returns `error-code::unsupported`.
   * 
   * Note: This is similar to `flock(fd, LOCK_SH | LOCK_NB)` in Unix.
   */
  export function tryLockShared(this: Descriptor): void;
  /**
   * Request an exclusive advisory lock for an open file.
   * 
   * This requests an *exclusive* lock; no other locks may be held for the
   * file while an exclusive lock is held.
   * 
   * If the open file has a shared lock and there are no exclusive locks held
   * for the file, this function upgrades the lock to an exclusive lock. If the
   * open file already has an exclusive lock, this function has no effect.
   * 
   * This requests an *advisory* lock, meaning that the file could be accessed
   * by other programs that don't hold the lock.
   * 
   * It is unspecified whether this function succeeds if the file descriptor
   * is not opened for writing. It is unspecified how exclusive locks interact
   * with locks acquired by non-WASI programs.
   * 
   * This function returns `error-code::would-block` if the lock cannot be
   * acquired.
   * 
   * Not all filesystems support locking; on filesystems which don't support
   * locking, this function returns `error-code::unsupported`.
   * 
   * Note: This is similar to `flock(fd, LOCK_EX | LOCK_NB)` in Unix.
   */
  export function tryLockExclusive(this: Descriptor): void;
  /**
   * Release a shared or exclusive lock on an open file.
   * 
   * Note: This is similar to `flock(fd, LOCK_UN)` in Unix.
   */
  export function unlock(this: Descriptor): void;
  /**
   * Dispose of the specified `descriptor`, after which it may no longer
   * be used.
   */
  export function dropDescriptor(this: Descriptor): void;
  /**
   * Read a single directory entry from a `directory-entry-stream`.
   */
  export function readDirectoryEntry(this: DirectoryEntryStream): DirectoryEntry | null;
  /**
   * Dispose of the specified `directory-entry-stream`, after which it may no longer
   * be used.
   */
  export function dropDirectoryEntryStream(this: DirectoryEntryStream): void;
}
import type { InputStream } from '../imports/wasi-io-streams';
export { InputStream };
import type { OutputStream } from '../imports/wasi-io-streams';
export { OutputStream };
import type { Datetime } from '../imports/wasi-clocks-wall-clock';
export { Datetime };
/**
 * File size or length of a region within a file.
 */
export type Filesize = bigint;
/**
 * The type of a filesystem object referenced by a descriptor.
 * 
 * Note: This was called `filetype` in earlier versions of WASI.
 * 
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * The type of the descriptor or file is unknown or is different from
 * any of the other types specified.
 * 
 * ## `"block-device"`
 * 
 * The descriptor refers to a block device inode.
 * 
 * ## `"character-device"`
 * 
 * The descriptor refers to a character device inode.
 * 
 * ## `"directory"`
 * 
 * The descriptor refers to a directory inode.
 * 
 * ## `"fifo"`
 * 
 * The descriptor refers to a named pipe.
 * 
 * ## `"symbolic-link"`
 * 
 * The file refers to a symbolic link inode.
 * 
 * ## `"regular-file"`
 * 
 * The descriptor refers to a regular file inode.
 * 
 * ## `"socket"`
 * 
 * The descriptor refers to a socket.
 */
export type DescriptorType = 'unknown' | 'block-device' | 'character-device' | 'directory' | 'fifo' | 'symbolic-link' | 'regular-file' | 'socket';
/**
 * Descriptor flags.
 * 
 * Note: This was called `fdflags` in earlier versions of WASI.
 */
export interface DescriptorFlags {
  /**
   * Read mode: Data can be read.
   */
  read?: boolean,
  /**
   * Write mode: Data can be written to.
   */
  write?: boolean,
  /**
   * Request that writes be performed according to synchronized I/O file
   * integrity completion. The data stored in the file and the file's
   * metadata are synchronized. This is similar to `O_SYNC` in POSIX.
   * 
   * The precise semantics of this operation have not yet been defined for
   * WASI. At this time, it should be interpreted as a request, and not a
   * requirement.
   */
  fileIntegritySync?: boolean,
  /**
   * Request that writes be performed according to synchronized I/O data
   * integrity completion. Only the data stored in the file is
   * synchronized. This is similar to `O_DSYNC` in POSIX.
   * 
   * The precise semantics of this operation have not yet been defined for
   * WASI. At this time, it should be interpreted as a request, and not a
   * requirement.
   */
  dataIntegritySync?: boolean,
  /**
   * Requests that reads be performed at the same level of integrety
   * requested for writes. This is similar to `O_RSYNC` in POSIX.
   * 
   * The precise semantics of this operation have not yet been defined for
   * WASI. At this time, it should be interpreted as a request, and not a
   * requirement.
   */
  requestedWriteSync?: boolean,
  /**
   * Mutating directories mode: Directory contents may be mutated.
   * 
   * When this flag is unset on a descriptor, operations using the
   * descriptor which would create, rename, delete, modify the data or
   * metadata of filesystem objects, or obtain another handle which
   * would permit any of those, shall fail with `error-code::read-only` if
   * they would otherwise succeed.
   * 
   * This may only be set on directories.
   */
  mutateDirectory?: boolean,
}
/**
 * Flags determining the method of how paths are resolved.
 */
export interface PathFlags {
  /**
   * As long as the resolved path corresponds to a symbolic link, it is
   * expanded.
   */
  symlinkFollow?: boolean,
}
/**
 * Open flags used by `open-at`.
 */
export interface OpenFlags {
  /**
   * Create file if it does not exist, similar to `O_CREAT` in POSIX.
   */
  create?: boolean,
  /**
   * Fail if not a directory, similar to `O_DIRECTORY` in POSIX.
   */
  directory?: boolean,
  /**
   * Fail if file already exists, similar to `O_EXCL` in POSIX.
   */
  exclusive?: boolean,
  /**
   * Truncate file to size 0, similar to `O_TRUNC` in POSIX.
   */
  truncate?: boolean,
}
/**
 * Permissions mode used by `open-at`, `change-file-permissions-at`, and
 * similar.
 */
export interface Modes {
  /**
   * True if the resource is considered readable by the containing
   * filesystem.
   */
  readable?: boolean,
  /**
   * True if the resource is considered writable by the containing
   * filesystem.
   */
  writable?: boolean,
  /**
   * True if the resource is considered executable by the containing
   * filesystem. This does not apply to directories.
   */
  executable?: boolean,
}
/**
 * Access type used by `access-at`.
 */
export type AccessType = AccessTypeAccess | AccessTypeExists;
/**
 * Test for readability, writeability, or executability.
 */
export interface AccessTypeAccess {
  tag: 'access',
  val: Modes,
}
/**
 * Test whether the path exists.
 */
export interface AccessTypeExists {
  tag: 'exists',
}
/**
 * Number of hard links to an inode.
 */
export type LinkCount = bigint;
/**
 * Identifier for a device containing a file system. Can be used in
 * combination with `inode` to uniquely identify a file or directory in
 * the filesystem.
 */
export type Device = bigint;
/**
 * Filesystem object serial number that is unique within its file system.
 */
export type Inode = bigint;
/**
 * File attributes.
 * 
 * Note: This was called `filestat` in earlier versions of WASI.
 */
export interface DescriptorStat {
  /**
   * Device ID of device containing the file.
   */
  device: Device,
  /**
   * File serial number.
   */
  inode: Inode,
  /**
   * File type.
   */
  type: DescriptorType,
  /**
   * Number of hard links to the file.
   */
  linkCount: LinkCount,
  /**
   * For regular files, the file size in bytes. For symbolic links, the
   * length in bytes of the pathname contained in the symbolic link.
   */
  size: Filesize,
  /**
   * Last data access timestamp.
   */
  dataAccessTimestamp: Datetime,
  /**
   * Last data modification timestamp.
   */
  dataModificationTimestamp: Datetime,
  /**
   * Last file status change timestamp.
   */
  statusChangeTimestamp: Datetime,
}
/**
 * When setting a timestamp, this gives the value to set it to.
 */
export type NewTimestamp = NewTimestampNoChange | NewTimestampNow | NewTimestampTimestamp;
/**
 * Leave the timestamp set to its previous value.
 */
export interface NewTimestampNoChange {
  tag: 'no-change',
}
/**
 * Set the timestamp to the current time of the system clock associated
 * with the filesystem.
 */
export interface NewTimestampNow {
  tag: 'now',
}
/**
 * Set the timestamp to the given value.
 */
export interface NewTimestampTimestamp {
  tag: 'timestamp',
  val: Datetime,
}
/**
 * A directory entry.
 */
export interface DirectoryEntry {
  /**
   * The serial number of the object referred to by this directory entry.
   * May be none if the inode value is not known.
   * 
   * When this is none, libc implementations might do an extra `stat-at`
   * call to retrieve the inode number to fill their `d_ino` fields, so
   * implementations which can set this to a non-none value should do so.
   */
  inode?: Inode,
  /**
   * The type of the file referred to by this directory entry.
   */
  type: DescriptorType,
  /**
   * The name of the object.
   */
  name: string,
}
/**
 * Error codes returned by functions, similar to `errno` in POSIX.
 * Not all of these error codes are returned by the functions provided by this
 * API; some are used in higher-level library layers, and others are provided
 * merely for alignment with POSIX.
 * 
 * # Variants
 * 
 * ## `"access"`
 * 
 * Permission denied, similar to `EACCES` in POSIX.
 * 
 * ## `"would-block"`
 * 
 * Resource unavailable, or operation would block, similar to `EAGAIN` and `EWOULDBLOCK` in POSIX.
 * 
 * ## `"already"`
 * 
 * Connection already in progress, similar to `EALREADY` in POSIX.
 * 
 * ## `"bad-descriptor"`
 * 
 * Bad descriptor, similar to `EBADF` in POSIX.
 * 
 * ## `"busy"`
 * 
 * Device or resource busy, similar to `EBUSY` in POSIX.
 * 
 * ## `"deadlock"`
 * 
 * Resource deadlock would occur, similar to `EDEADLK` in POSIX.
 * 
 * ## `"quota"`
 * 
 * Storage quota exceeded, similar to `EDQUOT` in POSIX.
 * 
 * ## `"exist"`
 * 
 * File exists, similar to `EEXIST` in POSIX.
 * 
 * ## `"file-too-large"`
 * 
 * File too large, similar to `EFBIG` in POSIX.
 * 
 * ## `"illegal-byte-sequence"`
 * 
 * Illegal byte sequence, similar to `EILSEQ` in POSIX.
 * 
 * ## `"in-progress"`
 * 
 * Operation in progress, similar to `EINPROGRESS` in POSIX.
 * 
 * ## `"interrupted"`
 * 
 * Interrupted function, similar to `EINTR` in POSIX.
 * 
 * ## `"invalid"`
 * 
 * Invalid argument, similar to `EINVAL` in POSIX.
 * 
 * ## `"io"`
 * 
 * I/O error, similar to `EIO` in POSIX.
 * 
 * ## `"is-directory"`
 * 
 * Is a directory, similar to `EISDIR` in POSIX.
 * 
 * ## `"loop"`
 * 
 * Too many levels of symbolic links, similar to `ELOOP` in POSIX.
 * 
 * ## `"too-many-links"`
 * 
 * Too many links, similar to `EMLINK` in POSIX.
 * 
 * ## `"message-size"`
 * 
 * Message too large, similar to `EMSGSIZE` in POSIX.
 * 
 * ## `"name-too-long"`
 * 
 * Filename too long, similar to `ENAMETOOLONG` in POSIX.
 * 
 * ## `"no-device"`
 * 
 * No such device, similar to `ENODEV` in POSIX.
 * 
 * ## `"no-entry"`
 * 
 * No such file or directory, similar to `ENOENT` in POSIX.
 * 
 * ## `"no-lock"`
 * 
 * No locks available, similar to `ENOLCK` in POSIX.
 * 
 * ## `"insufficient-memory"`
 * 
 * Not enough space, similar to `ENOMEM` in POSIX.
 * 
 * ## `"insufficient-space"`
 * 
 * No space left on device, similar to `ENOSPC` in POSIX.
 * 
 * ## `"not-directory"`
 * 
 * Not a directory or a symbolic link to a directory, similar to `ENOTDIR` in POSIX.
 * 
 * ## `"not-empty"`
 * 
 * Directory not empty, similar to `ENOTEMPTY` in POSIX.
 * 
 * ## `"not-recoverable"`
 * 
 * State not recoverable, similar to `ENOTRECOVERABLE` in POSIX.
 * 
 * ## `"unsupported"`
 * 
 * Not supported, similar to `ENOTSUP` and `ENOSYS` in POSIX.
 * 
 * ## `"no-tty"`
 * 
 * Inappropriate I/O control operation, similar to `ENOTTY` in POSIX.
 * 
 * ## `"no-such-device"`
 * 
 * No such device or address, similar to `ENXIO` in POSIX.
 * 
 * ## `"overflow"`
 * 
 * Value too large to be stored in data type, similar to `EOVERFLOW` in POSIX.
 * 
 * ## `"not-permitted"`
 * 
 * Operation not permitted, similar to `EPERM` in POSIX.
 * 
 * ## `"pipe"`
 * 
 * Broken pipe, similar to `EPIPE` in POSIX.
 * 
 * ## `"read-only"`
 * 
 * Read-only file system, similar to `EROFS` in POSIX.
 * 
 * ## `"invalid-seek"`
 * 
 * Invalid seek, similar to `ESPIPE` in POSIX.
 * 
 * ## `"text-file-busy"`
 * 
 * Text file busy, similar to `ETXTBSY` in POSIX.
 * 
 * ## `"cross-device"`
 * 
 * Cross-device link, similar to `EXDEV` in POSIX.
 */
export type ErrorCode = 'access' | 'would-block' | 'already' | 'bad-descriptor' | 'busy' | 'deadlock' | 'quota' | 'exist' | 'file-too-large' | 'illegal-byte-sequence' | 'in-progress' | 'interrupted' | 'invalid' | 'io' | 'is-directory' | 'loop' | 'too-many-links' | 'message-size' | 'name-too-long' | 'no-device' | 'no-entry' | 'no-lock' | 'insufficient-memory' | 'insufficient-space' | 'not-directory' | 'not-empty' | 'not-recoverable' | 'unsupported' | 'no-tty' | 'no-such-device' | 'overflow' | 'not-permitted' | 'pipe' | 'read-only' | 'invalid-seek' | 'text-file-busy' | 'cross-device';
/**
 * File or memory access pattern advisory information.
 * 
 * # Variants
 * 
 * ## `"normal"`
 * 
 * The application has no advice to give on its behavior with respect
 * to the specified data.
 * 
 * ## `"sequential"`
 * 
 * The application expects to access the specified data sequentially
 * from lower offsets to higher offsets.
 * 
 * ## `"random"`
 * 
 * The application expects to access the specified data in a random
 * order.
 * 
 * ## `"will-need"`
 * 
 * The application expects to access the specified data in the near
 * future.
 * 
 * ## `"dont-need"`
 * 
 * The application expects that it will not access the specified data
 * in the near future.
 * 
 * ## `"no-reuse"`
 * 
 * The application expects to access the specified data once and then
 * not reuse it thereafter.
 */
export type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';
/**
 * A descriptor is a reference to a filesystem object, which may be a file,
 * directory, named pipe, special file, or other object on which filesystem
 * calls may be made.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type Descriptor = number;
/**
 * A stream of directory entries.
 * 
 * This [represents a stream of `dir-entry`](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Streams).
 */
export type DirectoryEntryStream = number;
