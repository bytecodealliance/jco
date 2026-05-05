/** @module Interface wasi:filesystem/types@0.3.0-rc-2026-03-15 **/
export type Instant = import('./wasi-clocks-system-clock.js').Instant;
/**
 * File size or length of a region within a file.
 */
export type Filesize = bigint;
/**
 * The type of a filesystem object referenced by a descriptor.
 *
 * Note: This was called `filetype` in earlier versions of WASI.
 */
export type DescriptorType = DescriptorTypeBlockDevice | DescriptorTypeCharacterDevice | DescriptorTypeDirectory | DescriptorTypeFifo | DescriptorTypeSymbolicLink | DescriptorTypeRegularFile | DescriptorTypeSocket | DescriptorTypeOther;
/**
 * The descriptor refers to a block device inode.
 */
export interface DescriptorTypeBlockDevice {
  tag: 'block-device',
}
/**
 * The descriptor refers to a character device inode.
 */
export interface DescriptorTypeCharacterDevice {
  tag: 'character-device',
}
/**
 * The descriptor refers to a directory inode.
 */
export interface DescriptorTypeDirectory {
  tag: 'directory',
}
/**
 * The descriptor refers to a named pipe.
 */
export interface DescriptorTypeFifo {
  tag: 'fifo',
}
/**
 * The file refers to a symbolic link inode.
 */
export interface DescriptorTypeSymbolicLink {
  tag: 'symbolic-link',
}
/**
 * The descriptor refers to a regular file inode.
 */
export interface DescriptorTypeRegularFile {
  tag: 'regular-file',
}
/**
 * The descriptor refers to a socket.
 */
export interface DescriptorTypeSocket {
  tag: 'socket',
}
/**
 * The type of the descriptor or file is different from any of the
 * other types specified.
 */
export interface DescriptorTypeOther {
  tag: 'other',
  val: string | undefined,
}
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
   * Requests that reads be performed at the same level of integrity
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
 * Number of hard links to an inode.
 */
export type LinkCount = bigint;
/**
 * File attributes.
 *
 * Note: This was called `filestat` in earlier versions of WASI.
 */
export interface DescriptorStat {
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
   *
   * If the `option` is none, the platform doesn't maintain an access
   * timestamp for this file.
   */
  dataAccessTimestamp?: Instant,
  /**
   * Last data modification timestamp.
   *
   * If the `option` is none, the platform doesn't maintain a
   * modification timestamp for this file.
   */
  dataModificationTimestamp?: Instant,
  /**
   * Last file status-change timestamp.
   *
   * If the `option` is none, the platform doesn't maintain a
   * status-change timestamp for this file.
   */
  statusChangeTimestamp?: Instant,
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
  val: Instant,
}
/**
 * A directory entry.
 */
export interface DirectoryEntry {
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
 */
export type ErrorCode = ErrorCodeAccess | ErrorCodeAlready | ErrorCodeBadDescriptor | ErrorCodeBusy | ErrorCodeDeadlock | ErrorCodeQuota | ErrorCodeExist | ErrorCodeFileTooLarge | ErrorCodeIllegalByteSequence | ErrorCodeInProgress | ErrorCodeInterrupted | ErrorCodeInvalid | ErrorCodeIo | ErrorCodeIsDirectory | ErrorCodeLoop | ErrorCodeTooManyLinks | ErrorCodeMessageSize | ErrorCodeNameTooLong | ErrorCodeNoDevice | ErrorCodeNoEntry | ErrorCodeNoLock | ErrorCodeInsufficientMemory | ErrorCodeInsufficientSpace | ErrorCodeNotDirectory | ErrorCodeNotEmpty | ErrorCodeNotRecoverable | ErrorCodeUnsupported | ErrorCodeNoTty | ErrorCodeNoSuchDevice | ErrorCodeOverflow | ErrorCodeNotPermitted | ErrorCodePipe | ErrorCodeReadOnly | ErrorCodeInvalidSeek | ErrorCodeTextFileBusy | ErrorCodeCrossDevice | ErrorCodeOther;
/**
 * Permission denied, similar to `EACCES` in POSIX.
 */
export interface ErrorCodeAccess {
  tag: 'access',
}
/**
 * Connection already in progress, similar to `EALREADY` in POSIX.
 */
export interface ErrorCodeAlready {
  tag: 'already',
}
/**
 * Bad descriptor, similar to `EBADF` in POSIX.
 */
export interface ErrorCodeBadDescriptor {
  tag: 'bad-descriptor',
}
/**
 * Device or resource busy, similar to `EBUSY` in POSIX.
 */
export interface ErrorCodeBusy {
  tag: 'busy',
}
/**
 * Resource deadlock would occur, similar to `EDEADLK` in POSIX.
 */
export interface ErrorCodeDeadlock {
  tag: 'deadlock',
}
/**
 * Storage quota exceeded, similar to `EDQUOT` in POSIX.
 */
export interface ErrorCodeQuota {
  tag: 'quota',
}
/**
 * File exists, similar to `EEXIST` in POSIX.
 */
export interface ErrorCodeExist {
  tag: 'exist',
}
/**
 * File too large, similar to `EFBIG` in POSIX.
 */
export interface ErrorCodeFileTooLarge {
  tag: 'file-too-large',
}
/**
 * Illegal byte sequence, similar to `EILSEQ` in POSIX.
 */
export interface ErrorCodeIllegalByteSequence {
  tag: 'illegal-byte-sequence',
}
/**
 * Operation in progress, similar to `EINPROGRESS` in POSIX.
 */
export interface ErrorCodeInProgress {
  tag: 'in-progress',
}
/**
 * Interrupted function, similar to `EINTR` in POSIX.
 */
export interface ErrorCodeInterrupted {
  tag: 'interrupted',
}
/**
 * Invalid argument, similar to `EINVAL` in POSIX.
 */
export interface ErrorCodeInvalid {
  tag: 'invalid',
}
/**
 * I/O error, similar to `EIO` in POSIX.
 */
export interface ErrorCodeIo {
  tag: 'io',
}
/**
 * Is a directory, similar to `EISDIR` in POSIX.
 */
export interface ErrorCodeIsDirectory {
  tag: 'is-directory',
}
/**
 * Too many levels of symbolic links, similar to `ELOOP` in POSIX.
 */
export interface ErrorCodeLoop {
  tag: 'loop',
}
/**
 * Too many links, similar to `EMLINK` in POSIX.
 */
export interface ErrorCodeTooManyLinks {
  tag: 'too-many-links',
}
/**
 * Message too large, similar to `EMSGSIZE` in POSIX.
 */
export interface ErrorCodeMessageSize {
  tag: 'message-size',
}
/**
 * Filename too long, similar to `ENAMETOOLONG` in POSIX.
 */
export interface ErrorCodeNameTooLong {
  tag: 'name-too-long',
}
/**
 * No such device, similar to `ENODEV` in POSIX.
 */
export interface ErrorCodeNoDevice {
  tag: 'no-device',
}
/**
 * No such file or directory, similar to `ENOENT` in POSIX.
 */
export interface ErrorCodeNoEntry {
  tag: 'no-entry',
}
/**
 * No locks available, similar to `ENOLCK` in POSIX.
 */
export interface ErrorCodeNoLock {
  tag: 'no-lock',
}
/**
 * Not enough space, similar to `ENOMEM` in POSIX.
 */
export interface ErrorCodeInsufficientMemory {
  tag: 'insufficient-memory',
}
/**
 * No space left on device, similar to `ENOSPC` in POSIX.
 */
export interface ErrorCodeInsufficientSpace {
  tag: 'insufficient-space',
}
/**
 * Not a directory or a symbolic link to a directory, similar to `ENOTDIR` in POSIX.
 */
export interface ErrorCodeNotDirectory {
  tag: 'not-directory',
}
/**
 * Directory not empty, similar to `ENOTEMPTY` in POSIX.
 */
export interface ErrorCodeNotEmpty {
  tag: 'not-empty',
}
/**
 * State not recoverable, similar to `ENOTRECOVERABLE` in POSIX.
 */
export interface ErrorCodeNotRecoverable {
  tag: 'not-recoverable',
}
/**
 * Not supported, similar to `ENOTSUP` and `ENOSYS` in POSIX.
 */
export interface ErrorCodeUnsupported {
  tag: 'unsupported',
}
/**
 * Inappropriate I/O control operation, similar to `ENOTTY` in POSIX.
 */
export interface ErrorCodeNoTty {
  tag: 'no-tty',
}
/**
 * No such device or address, similar to `ENXIO` in POSIX.
 */
export interface ErrorCodeNoSuchDevice {
  tag: 'no-such-device',
}
/**
 * Value too large to be stored in data type, similar to `EOVERFLOW` in POSIX.
 */
export interface ErrorCodeOverflow {
  tag: 'overflow',
}
/**
 * Operation not permitted, similar to `EPERM` in POSIX.
 */
export interface ErrorCodeNotPermitted {
  tag: 'not-permitted',
}
/**
 * Broken pipe, similar to `EPIPE` in POSIX.
 */
export interface ErrorCodePipe {
  tag: 'pipe',
}
/**
 * Read-only file system, similar to `EROFS` in POSIX.
 */
export interface ErrorCodeReadOnly {
  tag: 'read-only',
}
/**
 * Invalid seek, similar to `ESPIPE` in POSIX.
 */
export interface ErrorCodeInvalidSeek {
  tag: 'invalid-seek',
}
/**
 * Text file busy, similar to `ETXTBSY` in POSIX.
 */
export interface ErrorCodeTextFileBusy {
  tag: 'text-file-busy',
}
/**
 * Cross-device link, similar to `EXDEV` in POSIX.
 */
export interface ErrorCodeCrossDevice {
  tag: 'cross-device',
}
/**
 * A catch-all for errors not captured by the existing variants.
 * Implementations can use this to extend the error type without
 * breaking existing code.
 */
export interface ErrorCodeOther {
  tag: 'other',
  val: string | undefined,
}
/**
 * File or memory access pattern advisory information.
 * # Variants
 *
 * ## `"normal"`
 *
 * The application has no advice to give on its behavior with respect
 * to the specified data.
 * ## `"sequential"`
 *
 * The application expects to access the specified data sequentially
 * from lower offsets to higher offsets.
 * ## `"random"`
 *
 * The application expects to access the specified data in a random
 * order.
 * ## `"will-need"`
 *
 * The application expects to access the specified data in the near
 * future.
 * ## `"dont-need"`
 *
 * The application expects that it will not access the specified data
 * in the near future.
 * ## `"no-reuse"`
 *
 * The application expects to access the specified data once and then
 * not reuse it thereafter.
 */
export type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';
/**
 * A 128-bit hash value, split into parts because wasm doesn't have a
 * 128-bit integer type.
 */
export interface MetadataHashValue {
  /**
   * 64 bits of a 128-bit hash value.
   */
  lower: bigint,
  /**
   * Another 64 bits of a 128-bit hash value.
   */
  upper: bigint,
}
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

export class Descriptor {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  /**
  * Return a stream for reading from a file.
  *
  * Multiple read, write, and append streams may be active on the same open
  * file and they do not interfere with each other.
  *
  * This function returns a `stream` which provides the data received from the
  * file, and a `future` providing additional error information in case an
  * error is encountered.
  *
  * If no error is encountered, `stream.read` on the `stream` will return
  * `read-status::closed` with no `error-context` and the future resolves to
  * the value `ok`. If an error is encountered, `stream.read` on the
  * `stream` returns `read-status::closed` with an `error-context` and the future
  * resolves to `err` with an `error-code`.
  *
  * Note: This is similar to `pread` in POSIX.
  */
  readViaStream(offset: Filesize): [ReadableStream<number>, Promise<Result<void, ErrorCode>>];
  /**
  * Return a stream for writing to a file, if available.
  *
  * May fail with an error-code describing why the file cannot be written.
  *
  * It is valid to write past the end of a file; the file is extended to the
  * extent of the write, with bytes between the previous end and the start of
  * the write set to zero.
  *
  * This function returns once either full contents of the stream are
  * written or an error is encountered.
  *
  * Note: This is similar to `pwrite` in POSIX.
  */
  writeViaStream(data: ReadableStream<number>, offset: Filesize): Promise<Result<void, ErrorCode>>;
  /**
  * Return a stream for appending to a file, if available.
  *
  * May fail with an error-code describing why the file cannot be appended.
  *
  * This function returns once either full contents of the stream are
  * written or an error is encountered.
  *
  * Note: This is similar to `write` with `O_APPEND` in POSIX.
  */
  appendViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>>;
  /**
  * Provide file advisory information on a descriptor.
  *
  * This is similar to `posix_fadvise` in POSIX.
  */
  advise(offset: Filesize, length: Filesize, advice: Advice): Promise<void>;
  /**
  * Synchronize the data of a file to disk.
  *
  * This function succeeds with no effect if the file descriptor is not
  * opened for writing.
  *
  * Note: This is similar to `fdatasync` in POSIX.
  */
  syncData(): Promise<void>;
  /**
  * Get flags associated with a descriptor.
  *
  * Note: This returns similar flags to `fcntl(fd, F_GETFL)` in POSIX.
  *
  * Note: This returns the value that was the `fs_flags` value returned
  * from `fdstat_get` in earlier versions of WASI.
  */
  getFlags(): Promise<DescriptorFlags>;
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
  getType(): Promise<DescriptorType>;
  /**
  * Adjust the size of an open file. If this increases the file's size, the
  * extra bytes are filled with zeros.
  *
  * Note: This was called `fd_filestat_set_size` in earlier versions of WASI.
  */
  setSize(size: Filesize): Promise<void>;
  /**
  * Adjust the timestamps of an open file or directory.
  *
  * Note: This is similar to `futimens` in POSIX.
  *
  * Note: This was called `fd_filestat_set_times` in earlier versions of WASI.
  */
  setTimes(dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): Promise<void>;
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
  *
  * This function returns a future, which will resolve to an error code if
  * reading full contents of the directory fails.
  */
  readDirectory(): [ReadableStream<DirectoryEntry>, Promise<Result<void, ErrorCode>>];
  /**
  * Synchronize the data and metadata of a file to disk.
  *
  * This function succeeds with no effect if the file descriptor is not
  * opened for writing.
  *
  * Note: This is similar to `fsync` in POSIX.
  */
  sync(): Promise<void>;
  /**
  * Create a directory.
  *
  * Note: This is similar to `mkdirat` in POSIX.
  */
  createDirectoryAt(path: string): Promise<void>;
  /**
  * Return the attributes of an open file or directory.
  *
  * Note: This is similar to `fstat` in POSIX, except that it does not return
  * device and inode information. For testing whether two descriptors refer to
  * the same underlying filesystem object, use `is-same-object`. To obtain
  * additional data that can be used do determine whether a file has been
  * modified, use `metadata-hash`.
  *
  * Note: This was called `fd_filestat_get` in earlier versions of WASI.
  */
  stat(): Promise<DescriptorStat>;
  /**
  * Return the attributes of a file or directory.
  *
  * Note: This is similar to `fstatat` in POSIX, except that it does not
  * return device and inode information. See the `stat` description for a
  * discussion of alternatives.
  *
  * Note: This was called `path_filestat_get` in earlier versions of WASI.
  */
  statAt(pathFlags: PathFlags, path: string): Promise<DescriptorStat>;
  /**
  * Adjust the timestamps of a file or directory.
  *
  * Note: This is similar to `utimensat` in POSIX.
  *
  * Note: This was called `path_filestat_set_times` in earlier versions of
  * WASI.
  */
  setTimesAt(pathFlags: PathFlags, path: string, dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): Promise<void>;
  /**
  * Create a hard link.
  *
  * Fails with `error-code::no-entry` if the old path does not exist,
  * with `error-code::exist` if the new path already exists, and
  * `error-code::not-permitted` if the old path is not a file.
  *
  * Note: This is similar to `linkat` in POSIX.
  */
  linkAt(oldPathFlags: PathFlags, oldPath: string, newDescriptor: Descriptor, newPath: string): Promise<void>;
  /**
  * Open a file or directory.
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
  openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, flags: DescriptorFlags): Promise<Descriptor>;
  /**
  * Read the contents of a symbolic link.
  *
  * If the contents contain an absolute or rooted path in the underlying
  * filesystem, this function fails with `error-code::not-permitted`.
  *
  * Note: This is similar to `readlinkat` in POSIX.
  */
  readlinkAt(path: string): Promise<string>;
  /**
  * Remove a directory.
  *
  * Return `error-code::not-empty` if the directory is not empty.
  *
  * Note: This is similar to `unlinkat(fd, path, AT_REMOVEDIR)` in POSIX.
  */
  removeDirectoryAt(path: string): Promise<void>;
  /**
  * Rename a filesystem object.
  *
  * Note: This is similar to `renameat` in POSIX.
  */
  renameAt(oldPath: string, newDescriptor: Descriptor, newPath: string): Promise<void>;
  /**
  * Create a symbolic link (also known as a "symlink").
  *
  * If `old-path` starts with `/`, the function fails with
  * `error-code::not-permitted`.
  *
  * Note: This is similar to `symlinkat` in POSIX.
  */
  symlinkAt(oldPath: string, newPath: string): Promise<void>;
  /**
  * Unlink a filesystem object that is not a directory.
  *
  * This is similar to `unlinkat(fd, path, 0)` in POSIX.
  *
  * Error returns are as specified by POSIX.
  *
  * If the filesystem object is a directory, `error-code::access` or
  * `error-code::is-directory` may be returned instead of the
  * POSIX-specified `error-code::not-permitted`.
  */
  unlinkFileAt(path: string): Promise<void>;
  /**
  * Test whether two descriptors refer to the same filesystem object.
  *
  * In POSIX, this corresponds to testing whether the two descriptors have the
  * same device (`st_dev`) and inode (`st_ino` or `d_ino`) numbers.
  * wasi-filesystem does not expose device and inode numbers, so this function
  * may be used instead.
  */
  isSameObject(other: Descriptor): Promise<boolean>;
  /**
  * Return a hash of the metadata associated with a filesystem object referred
  * to by a descriptor.
  *
  * This returns a hash of the last-modification timestamp and file size, and
  * may also include the inode number, device number, birth timestamp, and
  * other metadata fields that may change when the file is modified or
  * replaced. It may also include a secret value chosen by the
  * implementation and not otherwise exposed.
  *
  * Implementations are encouraged to provide the following properties:
  *
  *  - If the file is not modified or replaced, the computed hash value should
  *    usually not change.
  *  - If the object is modified or replaced, the computed hash value should
  *    usually change.
  *  - The inputs to the hash should not be easily computable from the
  *    computed hash.
  *
  * However, none of these is required.
  */
  metadataHash(): Promise<MetadataHashValue>;
  /**
  * Return a hash of the metadata associated with a filesystem object referred
  * to by a directory descriptor and a relative path.
  *
  * This performs the same hash computation as `metadata-hash`.
  */
  metadataHashAt(pathFlags: PathFlags, path: string): Promise<MetadataHashValue>;
}
