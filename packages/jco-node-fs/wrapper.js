const { getSystemErrorName } = require('node:util');

const { DirHandle, fadviseRaw, renameRaw } = require('./index.js');

const MAX_U64 = (1n << 64n) - 1n;
const ADVICE = new Set(['normal', 'sequential', 'random', 'will-need', 'dont-need', 'no-reuse']);

function fadvise(fd, offset, length, advice) {
    if (!Number.isInteger(fd) || fd < 0) {
        throw new TypeError('fd must be a non-negative integer');
    }
    validateFilesize(offset, 'offset');
    validateFilesize(length, 'length');
    if (!ADVICE.has(advice)) {
        throw new TypeError(`unknown file advice: ${advice}`);
    }

    const errno = fadviseRaw(fd, offset.toString(), length.toString(), advice);
    if (errno === 0) {
        return;
    }

    const code = getSystemErrorName(-errno);
    const error = new Error(`${code}: fadvise`);
    error.code = code;
    error.errno = -errno;
    error.syscall = 'fadvise';
    throw error;
}

function validateFilesize(value, name) {
    if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) {
        throw new TypeError(`${name} must be an unsigned 64-bit bigint`);
    }
}

module.exports.fadvise = fadvise;

function rename(oldPath, newPath) {
    for (const [name, value] of [
        ['oldPath', oldPath],
        ['newPath', newPath],
    ]) {
        if (typeof value !== 'string' || value.includes('\0')) {
            throw new TypeError(`${name} must be a string without null bytes`);
        }
    }
    try {
        renameRaw(oldPath, newPath);
    } catch (error) {
        error.syscall = 'rename';
        error.path = oldPath;
        error.dest = newPath;
        throw error;
    }
}

module.exports.rename = rename;

const OPEN_OPTIONS = ['read', 'write', 'create', 'exclusive', 'truncate', 'directory', 'follow', 'sync', 'dsync'];
const MAX_TIME_NS = (1n << 63n) * 1_000_000_000n;

/**
 * Check that a value is a path that can be passed to the host.
 *
 * @param {unknown} value - the value to check
 * @param {string} name - the argument's name, for the error message
 */
function validatePath(value, name) {
    if (typeof value !== 'string' || value.includes('\0')) {
        throw new TypeError(`${name} must be a string without null bytes`);
    }
}

/**
 * Check that a value is a time that `setTimes` and `setTimesAt` accept.
 *
 * @param {unknown} value - the value to check
 * @param {string} name - the argument's name, for the error message
 */
function validateTime(value, name) {
    if (value === null || value === 'now') {
        return;
    }
    if (typeof value !== 'bigint' || value < -MAX_TIME_NS || value > MAX_TIME_NS) {
        throw new TypeError(`${name} must be null, 'now' or a bigint of nanoseconds since the Unix epoch`);
    }
}

/**
 * Run a native directory operation, describing the operation on its error.
 *
 * @template T
 * @param {string} syscall - the operation's name
 * @param {string | undefined} path - the path the operation acts on
 * @param {string | undefined} dest - the operation's destination path
 * @param {() => T} operation - the native call
 * @returns {T} the result of the native call
 */
function call(syscall, path, dest, operation) {
    try {
        return operation();
    } catch (error) {
        error.syscall = syscall;
        if (path !== undefined) {
            error.path = path;
        }
        if (dest !== undefined) {
            error.dest = dest;
        }
        throw error;
    }
}

/**
 * An open directory whose path operations cannot resolve outside of it.
 */
class Dir {
    /** The native handle. */
    #handle;

    /**
     * @param {InstanceType<typeof DirHandle>} handle - the native handle to wrap
     */
    constructor(handle) {
        if (!(handle instanceof DirHandle)) {
            throw new TypeError('use Dir.open() to open a directory');
        }
        this.#handle = handle;
    }

    /**
     * Open a host directory with the authority of the process.
     *
     * @param {string} path - host path of the directory
     * @returns {Dir} the open directory
     */
    static open(path) {
        validatePath(path, 'path');
        return new Dir(call('open', path, undefined, () => DirHandle.openAmbient(path)));
    }

    /**
     * Release the directory. Later operations fail with `EBADF`.
     */
    close() {
        this.#handle.close();
    }

    /**
     * Open a file or directory beneath this directory.
     *
     * @param {string} path - path relative to this directory
     * @param {Record<string, boolean>} [options] - how to open the path
     * @returns {Dir | number} a directory, or a file descriptor the caller must close
     */
    openAt(path, options = {}) {
        validatePath(path, 'path');
        const nativeOptions = {};
        for (const name of OPEN_OPTIONS) {
            const value = options[name] ?? false;
            if (typeof value !== 'boolean') {
                throw new TypeError(`options.${name} must be a boolean`);
            }
            nativeOptions[name] = value;
        }

        const opened = call('open', path, undefined, () => this.#handle.openAt(path, nativeOptions));
        return typeof opened === 'number' ? opened : new Dir(opened);
    }

    /**
     * Return the attributes of this directory.
     *
     * @returns {object} the attributes
     */
    stat() {
        return call('fstat', undefined, undefined, () => this.#handle.stat());
    }

    /**
     * Return the attributes of a path beneath this directory.
     *
     * @param {string} path - path relative to this directory
     * @param {boolean} follow - whether to follow a symlink in the final component
     * @returns {object} the attributes
     */
    statAt(path, follow) {
        validatePath(path, 'path');
        return call(follow ? 'stat' : 'lstat', path, undefined, () => this.#handle.statAt(path, Boolean(follow)));
    }

    /**
     * Return the target of a symlink, exactly as stored.
     *
     * @param {string} path - path relative to this directory
     * @returns {string} the symlink's target
     */
    readlinkAt(path) {
        validatePath(path, 'path');
        return call('readlink', path, undefined, () => this.#handle.readlinkAt(path));
    }

    /**
     * Create a directory.
     *
     * @param {string} path - path relative to this directory
     */
    createDirAt(path) {
        validatePath(path, 'path');
        call('mkdir', path, undefined, () => this.#handle.createDirAt(path));
    }

    /**
     * Remove an empty directory.
     *
     * @param {string} path - path relative to this directory
     */
    removeDirAt(path) {
        validatePath(path, 'path');
        call('rmdir', path, undefined, () => this.#handle.removeDirAt(path));
    }

    /**
     * Remove a file or symlink. A symlink is removed, not its target.
     *
     * @param {string} path - path relative to this directory
     */
    unlinkAt(path) {
        validatePath(path, 'path');
        call('unlink', path, undefined, () => this.#handle.unlinkAt(path));
    }

    /**
     * Rename a path beneath this directory to a path beneath another directory.
     *
     * @param {string} oldPath - path relative to this directory
     * @param {Dir} newDir - directory the new path is relative to
     * @param {string} newPath - path relative to `newDir`
     */
    renameAt(oldPath, newDir, newPath) {
        validatePath(oldPath, 'oldPath');
        validatePath(newPath, 'newPath');
        const newHandle = Dir.#handleOf(newDir);
        call('rename', oldPath, newPath, () => this.#handle.renameAt(oldPath, newHandle, newPath));
    }

    /**
     * Create a hard link beneath another directory.
     *
     * @param {string} oldPath - path relative to this directory
     * @param {Dir} newDir - directory the new path is relative to
     * @param {string} newPath - path relative to `newDir`
     * @param {boolean} [follow] - link the target of a symlink at `oldPath`, not the symlink
     */
    linkAt(oldPath, newDir, newPath, follow = false) {
        validatePath(oldPath, 'oldPath');
        validatePath(newPath, 'newPath');
        const newHandle = Dir.#handleOf(newDir);
        call('link', oldPath, newPath, () => this.#handle.linkAt(oldPath, newHandle, newPath, Boolean(follow)));
    }

    /**
     * Create a symlink. An absolute target is refused with `EPERM`.
     *
     * @param {string} target - what the symlink refers to
     * @param {string} path - path of the symlink, relative to this directory
     */
    symlinkAt(target, path) {
        validatePath(target, 'target');
        validatePath(path, 'path');
        call('symlink', target, path, () => this.#handle.symlinkAt(target, path));
    }

    /**
     * Set the access and modification times of this directory.
     *
     * @param {bigint | 'now' | null} atime - new access time, null to keep it
     * @param {bigint | 'now' | null} mtime - new modification time, null to keep it
     */
    setTimes(atime, mtime) {
        validateTime(atime, 'atime');
        validateTime(mtime, 'mtime');
        call('futimes', undefined, undefined, () => this.#handle.setTimes(atime, mtime));
    }

    /**
     * Set the access and modification times of a path beneath this directory.
     *
     * @param {string} path - path relative to this directory
     * @param {bigint | 'now' | null} atime - new access time, null to keep it
     * @param {bigint | 'now' | null} mtime - new modification time, null to keep it
     * @param {boolean} follow - whether to follow a symlink in the final component
     */
    setTimesAt(path, atime, mtime, follow) {
        validatePath(path, 'path');
        validateTime(atime, 'atime');
        validateTime(mtime, 'mtime');
        call(follow ? 'utimes' : 'lutimes', path, undefined, () =>
            this.#handle.setTimesAt(path, atime, mtime, Boolean(follow)),
        );
    }

    /**
     * Flush this directory to its device.
     */
    sync() {
        call('fsync', undefined, undefined, () => this.#handle.sync());
    }

    /**
     * List this directory, without `.` and `..`.
     *
     * @returns {Array<{ name: string, type: string }>} the entries
     */
    readDir() {
        return call('scandir', undefined, undefined, () => this.#handle.readDir());
    }

    /**
     * Return the native handle of a directory passed as an argument.
     *
     * @param {unknown} dir - the argument
     * @returns {InstanceType<typeof DirHandle>} its native handle
     */
    static #handleOf(dir) {
        if (!(dir instanceof Dir)) {
            throw new TypeError('newDir must be a Dir');
        }
        return dir.#handle;
    }
}

module.exports.Dir = Dir;
