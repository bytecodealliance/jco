export type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';

/**
 * Declare the expected access pattern for a region of an open file.
 *
 * A length of zero applies the advice from `offset` through the end of the file.
 * On hosts without a runtime file-advice API, this succeeds without issuing a hint.
 */
export function fadvise(fd: number, offset: bigint, length: bigint, advice: Advice): void;

/**
 * Synchronously rename a file or directory, atomically replacing an existing
 * file or empty directory. Symlinks themselves are renamed, not their targets.
 *
 * Paths are host filesystem strings, resolved relative to the current directory
 * when not absolute.
 *
 * Errors expose code, syscall, path and dest properties.
 */
export function rename(oldPath: string, newPath: string): void;

export type FileType =
    | 'directory'
    | 'regular-file'
    | 'symbolic-link'
    | 'block-device'
    | 'character-device'
    | 'fifo'
    | 'socket'
    | 'unknown';

/** Attributes of a filesystem object. Times are nanoseconds since the Unix epoch. */
export interface Stat {
    type: FileType;
    dev: bigint;
    ino: bigint;
    nlink: bigint;
    size: bigint;
    atimeNs: bigint;
    mtimeNs: bigint;
    /** Status change time. On Windows, which has none, the creation time. */
    ctimeNs: bigint;
}

export interface DirEntry {
    name: string;
    type: FileType;
}

/** How `Dir.openAt` opens a path. Every option defaults to false. */
export interface OpenAtOptions {
    /** Open for reading. A file that is not opened for writing is always readable. */
    read?: boolean;
    /** Open for writing. */
    write?: boolean;
    /** Create the file if it does not exist. Implies `write`. */
    create?: boolean;
    /** Together with `create`, fail with `EEXIST` if the path exists. */
    exclusive?: boolean;
    /** Truncate the file to zero length. Implies `write`. */
    truncate?: boolean;
    /** Fail with `ENOTDIR` unless the path is a directory. */
    directory?: boolean;
    /** Follow a symlink in the final path component, instead of failing with `ELOOP`. */
    follow?: boolean;
    /** Complete each write only once data and metadata reach the device. */
    sync?: boolean;
    /** Complete each write only once data reaches the device. */
    dsync?: boolean;
}

/**
 * A time to set: nanoseconds since the Unix epoch, the current time, or `null`
 * to leave the time unchanged.
 */
export type NewTime = bigint | 'now' | null;

/**
 * An open directory whose path operations cannot resolve outside of it.
 *
 * Paths are relative to the directory. A path that would leave it, through
 * `..`, an absolute path or a symlink, fails with `EPERM`. The handle refers to
 * the directory itself rather than to its path, so it is unaffected by the
 * directory being renamed or its path being replaced.
 *
 * Every method is synchronous. Errors expose `code` and `syscall`, and `path`
 * and `dest` where the operation takes them. A handle belongs to the thread
 * that opened it and cannot be passed to another thread.
 */
export class Dir {
    private constructor();

    /**
     * Open a host directory with the authority of the process. This is the only
     * operation that is not confined to a directory.
     */
    static open(path: string): Dir;

    /** Release the directory. Later operations fail with `EBADF`. */
    close(): void;

    /**
     * Open a file or directory beneath this directory.
     *
     * A directory is returned as a `Dir`. Anything else is returned as a file
     * descriptor for use with `node:fs`, which the caller must close.
     */
    openAt(path: string, options?: OpenAtOptions): Dir | number;

    /** Return the attributes of this directory. */
    stat(): Stat;

    /** Return the attributes of a path, or of a final symlink itself without `follow`. */
    statAt(path: string, follow: boolean): Stat;

    /** Return the target of a symlink, exactly as stored. */
    readlinkAt(path: string): string;

    /** Create a directory. */
    createDirAt(path: string): void;

    /** Remove an empty directory. */
    removeDirAt(path: string): void;

    /** Remove a file or symlink. A symlink is removed, not its target. */
    unlinkAt(path: string): void;

    /** Rename a path beneath this directory to a path beneath `newDir`. */
    renameAt(oldPath: string, newDir: Dir, newPath: string): void;

    /**
     * Create a hard link beneath `newDir`. A symlink at `oldPath` is linked
     * itself, or with `follow` resolved beneath this directory and its target linked.
     */
    linkAt(oldPath: string, newDir: Dir, newPath: string, follow?: boolean): void;

    /** Create a symlink at `path`. An absolute `target` is refused with `EPERM`. */
    symlinkAt(target: string, path: string): void;

    /** Set the access and modification times of this directory. */
    setTimes(atime: NewTime, mtime: NewTime): void;

    /** Set the times of a path, or of a final symlink itself without `follow`. */
    setTimesAt(path: string, atime: NewTime, mtime: NewTime, follow: boolean): void;

    /** Flush this directory to its device. */
    sync(): void;

    /** List this directory, without `.` and `..`. */
    readDir(): DirEntry[];
}
