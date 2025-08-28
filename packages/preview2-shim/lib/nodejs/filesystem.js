import {
    earlyDispose,
    inputStreamCreate,
    ioCall,
    outputStreamCreate,
    registerDispose,
} from '../io/worker-io.js';
import { INPUT_STREAM_CREATE, OUTPUT_STREAM_CREATE } from '../io/calls.js';
import { FILE } from '../io/calls.js';
import nodeFs, {
    closeSync,
    constants,
    fdatasyncSync,
    fstatSync,
    fsyncSync,
    ftruncateSync,
    futimesSync,
    linkSync,
    lstatSync,
    mkdirSync,
    opendirSync,
    openSync,
    readlinkSync,
    readSync,
    renameSync,
    rmdirSync,
    statSync,
    symlinkSync,
    unlinkSync,
    utimesSync,
    writeSync,
} from 'node:fs';
import { platform } from 'node:process';

const lutimesSync = nodeFs.lutimesSync;

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

const isWindows = platform === 'win32';
const isMac = platform === 'darwin';

const nsMagnitude = 1_000_000_000_000n;
function nsToDateTime(ns) {
    const seconds = ns / nsMagnitude;
    const nanoseconds = Number(ns % nsMagnitude);
    return { seconds, nanoseconds };
}

function lookupType(obj) {
    if (obj.isFile()) {
        return 'regular-file';
    } else if (obj.isSocket()) {
        return 'socket';
    } else if (obj.isSymbolicLink()) {
        return 'symbolic-link';
    } else if (obj.isFIFO()) {
        return 'fifo';
    } else if (obj.isDirectory()) {
        return 'directory';
    } else if (obj.isCharacterDevice()) {
        return 'character-device';
    } else if (obj.isBlockDevice()) {
        return 'block-device';
    }
    return 'unknown';
}

// Note: This should implement per-segment semantics of openAt, but we cannot
//       currently due to the lack of support for openat() in Node.js.
//       Tracking issue: https://github.com/libuv/libuv/issues/4167

/**
 * @implements {DescriptorProps}
 */
class Descriptor {
    #hostPreopen;
    #fd;
    #finalizer;
    #mode;
    #fullPath;

    static _createPreopen(hostPreopen) {
        const descriptor = new Descriptor();
        descriptor.#hostPreopen = hostPreopen.endsWith('/')
            ? hostPreopen.slice(0, -1) || '/'
            : hostPreopen;
        // Windows requires UNC paths at minimum
        if (isWindows) {
            descriptor.#hostPreopen = descriptor.#hostPreopen.replace(
                /\\/g,
                '/'
            );
            if (descriptor.#hostPreopen === '/') {
                descriptor.#hostPreopen = '//';
            }
        }
        return descriptor;
    }

    static _create(fd, mode, fullPath) {
        const descriptor = new Descriptor();
        descriptor.#fd = fd;
        descriptor.#finalizer = registerDispose(
            descriptor,
            null,
            fd,
            closeSync
        );
        descriptor.#mode = mode;
        descriptor.#fullPath = fullPath;
        return descriptor;
    }

    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }

    readViaStream(offset) {
        if (this.#hostPreopen) {
            throw 'is-directory';
        }
        return inputStreamCreate(
            FILE,
            ioCall(INPUT_STREAM_CREATE | FILE, null, {
                fd: this.#fd,
                offset,
            })
        );
    }

    writeViaStream(offset) {
        if (this.#hostPreopen) {
            throw 'is-directory';
        }
        return outputStreamCreate(
            FILE,
            ioCall(OUTPUT_STREAM_CREATE | FILE, null, { fd: this.#fd, offset })
        );
    }

    appendViaStream() {
        return this.writeViaStream(this.stat().size);
    }

    advise(_offset, _length, _advice) {
        if (this.getType() === 'directory') {
            throw 'bad-descriptor';
        }
    }

    syncData() {
        if (this.#hostPreopen) {
            throw 'invalid';
        }
        try {
            fdatasyncSync(this.#fd);
        } catch (e) {
            if (e.code === 'EPERM') {
                return;
            }
            throw convertFsError(e);
        }
    }

    getFlags() {
        return this.#mode;
    }

    getType() {
        if (this.#hostPreopen) {
            return 'directory';
        }
        const stats = fstatSync(this.#fd);
        return lookupType(stats);
    }

    setSize(size) {
        if (this.#hostPreopen) {
            throw 'is-directory';
        }
        try {
            ftruncateSync(this.#fd, Number(size));
        } catch (e) {
            if (isWindows && e.code === 'EPERM') {
                throw 'access';
            }
            throw convertFsError(e);
        }
    }

    setTimes(dataAccessTimestamp, dataModificationTimestamp) {
        if (this.#hostPreopen) {
            throw 'invalid';
        }
        let stats;
        if (
            dataAccessTimestamp.tag === 'no-change' ||
            dataModificationTimestamp.tag === 'no-change'
        ) {
            stats = this.stat();
        }
        const atime = this.#getNewTimestamp(
            dataAccessTimestamp,
            dataAccessTimestamp.tag === 'no-change' && stats.dataAccessTimestamp
        );
        const mtime = this.#getNewTimestamp(
            dataModificationTimestamp,
            dataModificationTimestamp.tag === 'no-change' &&
                stats.dataModificationTimestamp
        );
        try {
            futimesSync(this.#fd, atime, mtime);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    #getNewTimestamp(newTimestamp, maybeNow) {
        switch (newTimestamp.tag) {
        case 'no-change':
            return timestampToMs(maybeNow);
        case 'now':
            return Math.floor(Date.now() / 1e3);
        case 'timestamp':
            return timestampToMs(newTimestamp.val);
        }
    }

    read(length, offset) {
        if (!this.#fullPath) {
            throw 'bad-descriptor';
        }
        const buf = new Uint8Array(Number(length));
        const bytesRead = readSync(
            this.#fd,
            buf,
            0,
            Number(length),
            Number(offset)
        );
        const out = new Uint8Array(buf.buffer, 0, bytesRead);
        return [out, bytesRead === 0 ? 'ended' : 'open'];
    }

    write(buffer, offset) {
        if (!this.#fullPath) {
            throw 'bad-descriptor';
        }
        return BigInt(
            writeSync(this.#fd, buffer, 0, buffer.byteLength, Number(offset))
        );
    }

    readDirectory() {
        if (!this.#fullPath) {
            throw 'bad-descriptor';
        }
        try {
            const dir = opendirSync(this.#fullPath);
            return directoryEntryStreamCreate(dir);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    sync() {
        if (this.#hostPreopen) {
            throw 'invalid';
        }
        try {
            fsyncSync(this.#fd);
        } catch (e) {
            if (e.code === 'EPERM') {
                return;
            }
            throw convertFsError(e);
        }
    }

    createDirectoryAt(path) {
        const fullPath = this.#getFullPath(path);
        try {
            mkdirSync(fullPath);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    stat() {
        if (this.#hostPreopen) {
            throw 'invalid';
        }
        let stats;
        try {
            stats = fstatSync(this.#fd, { bigint: true });
        } catch (e) {
            throw convertFsError(e);
        }
        const type = lookupType(stats);
        return {
            type,
            linkCount: stats.nlink,
            size: stats.size,
            dataAccessTimestamp: nsToDateTime(stats.atimeNs),
            dataModificationTimestamp: nsToDateTime(stats.mtimeNs),
            statusChangeTimestamp: nsToDateTime(stats.ctimeNs),
        };
    }

    statAt(pathFlags, path) {
        const fullPath = this.#getFullPath(path, false);
        let stats;
        try {
            stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(fullPath, {
                bigint: true,
            });
        } catch (e) {
            throw convertFsError(e);
        }
        const type = lookupType(stats);
        return {
            type,
            linkCount: stats.nlink,
            size: stats.size,
            dataAccessTimestamp: nsToDateTime(stats.atimeNs),
            dataModificationTimestamp: nsToDateTime(stats.mtimeNs),
            statusChangeTimestamp: nsToDateTime(stats.ctimeNs),
        };
    }

    setTimesAt(
        pathFlags,
        path,
        dataAccessTimestamp,
        dataModificationTimestamp
    ) {
        const fullPath = this.#getFullPath(path, false);
        let stats;
        if (
            dataAccessTimestamp.tag === 'no-change' ||
            dataModificationTimestamp.tag === 'no-change'
        ) {
            stats = this.stat();
        }
        const atime = this.#getNewTimestamp(
            dataAccessTimestamp,
            dataAccessTimestamp.tag === 'no-change' && stats.dataAccessTimestamp
        );
        const mtime = this.#getNewTimestamp(
            dataModificationTimestamp,
            dataModificationTimestamp.tag === 'no-change' &&
                stats.dataModificationTimestamp
        );
        if (!pathFlags.symlinkFollow && !lutimesSync) {
            throw new Error(
                "Changing the timestamps of symlinks isn't supported"
            );
        }
        try {
            (pathFlags.symlinkFollow ? utimesSync : lutimesSync)(
                fullPath,
                atime,
                mtime
            );
        } catch (e) {
            throw convertFsError(e);
        }
    }

    linkAt(oldPathFlags, oldPath, newDescriptor, newPath) {
        const oldFullPath = this.#getFullPath(
            oldPath,
            oldPathFlags.symlinkFollow
        );
        const newFullPath = newDescriptor.#getFullPath(newPath, false);
        // Windows doesn't automatically fail on trailing slashes
        if (isWindows && newFullPath.endsWith('/')) {
            throw 'no-entry';
        }
        try {
            linkSync(oldFullPath, newFullPath);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    openAt(pathFlags, path, openFlags, descriptorFlags) {
        if (preopenEntries.length === 0) {
            throw 'access';
        }
        const fullPath = this.#getFullPath(path, pathFlags.symlinkFollow);
        let fsOpenFlags = 0x0;
        if (openFlags.create) {
            fsOpenFlags |= constants.O_CREAT;
        }
        if (openFlags.directory) {
            fsOpenFlags |= constants.O_DIRECTORY;
        }
        if (openFlags.exclusive) {
            fsOpenFlags |= constants.O_EXCL;
        }
        if (openFlags.truncate) {
            fsOpenFlags |= constants.O_TRUNC;
        }
        if (descriptorFlags.read && descriptorFlags.write) {
            fsOpenFlags |= constants.O_RDWR;
        } else if (descriptorFlags.write) {
            fsOpenFlags |= constants.O_WRONLY;
        } else if (descriptorFlags.read) {
            fsOpenFlags |= constants.O_RDONLY;
        }
        if (descriptorFlags.fileIntegritySync) {
            fsOpenFlags |= constants.O_SYNC;
        }
        if (descriptorFlags.dataIntegritySync) {
            fsOpenFlags |= constants.O_DSYNC;
        }
        if (!pathFlags.symlinkFollow) {
            fsOpenFlags |= constants.O_NOFOLLOW;
        }
        if (
            descriptorFlags.requestedWriteSync ||
            descriptorFlags.mutateDirectory
        ) {
            throw 'unsupported';
        }
        // Currently throw to match Wasmtime
        if (
            descriptorFlags.fileIntegritySync ||
            descriptorFlags.dataIntegritySync
        ) {
            throw 'unsupported';
        }
        if (isWindows) {
            if (!pathFlags.symlinkFollow && !openFlags.create) {
                let isSymlink = false;
                try {
                    isSymlink = lstatSync(fullPath).isSymbolicLink();
                } catch {
                    //
                }
                if (isSymlink) {
                    throw openFlags.directory ? 'not-directory' : 'loop';
                }
            }
            if (pathFlags.symlinkFollow && openFlags.directory) {
                let isFile = false;
                try {
                    isFile = !statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                if (isFile) {
                    throw 'not-directory';
                }
            }
        }
        try {
            const fd = openSync(
                fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath,
                fsOpenFlags
            );
            const descriptor = descriptorCreate(
                fd,
                descriptorFlags,
                fullPath,
                preopenEntries
            );
            if (
                fullPath.endsWith('/') &&
                descriptor.getType() !== 'directory'
            ) {
                descriptor[symbolDispose]();
                throw 'not-directory';
            }
            return descriptor;
        } catch (e) {
            if (e.code === 'ERR_INVALID_ARG_VALUE') {
                throw isWindows ? 'no-entry' : 'invalid';
            }
            throw convertFsError(e);
        }
    }

    readlinkAt(path) {
        const fullPath = this.#getFullPath(path, false);
        try {
            return readlinkSync(fullPath);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    removeDirectoryAt(path) {
        const fullPath = this.#getFullPath(path, false);
        try {
            rmdirSync(fullPath);
        } catch (e) {
            if (isWindows && e.code === 'ENOENT') {
                throw 'not-directory';
            }
            throw convertFsError(e);
        }
    }

    renameAt(oldPath, newDescriptor, newPath) {
        const oldFullPath = this.#getFullPath(oldPath, false);
        const newFullPath = newDescriptor.#getFullPath(newPath, false);
        try {
            renameSync(oldFullPath, newFullPath);
        } catch (e) {
            if (isWindows && e.code === 'EPERM') {
                throw 'access';
            }
            throw convertFsError(e);
        }
    }

    symlinkAt(target, path) {
        const fullPath = this.#getFullPath(path, false);
        if (target.startsWith('/')) {
            throw 'not-permitted';
        }
        try {
            symlinkSync(target, fullPath);
        } catch (e) {
            if (fullPath.endsWith('/') && e.code === 'EEXIST') {
                let isDir = false;
                try {
                    isDir = statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                if (!isDir) {
                    throw isWindows ? 'no-entry' : 'not-directory';
                }
            }
            if (isWindows) {
                if (e.code === 'EPERM' || e.code === 'EEXIST') {
                    throw 'no-entry';
                }
            }
            throw convertFsError(e);
        }
    }

    unlinkFileAt(path) {
        const fullPath = this.#getFullPath(path, false);
        try {
            if (fullPath.endsWith('/')) {
                let isDir = false;
                try {
                    isDir = statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                throw isDir
                    ? isWindows
                        ? 'access'
                        : isMac
                            ? 'not-permitted'
                            : 'is-directory'
                    : 'not-directory';
            }
            unlinkSync(fullPath);
        } catch (e) {
            if (isWindows && e.code === 'EPERM') {
                throw 'access';
            }
            throw convertFsError(e);
        }
    }

    isSameObject(other) {
        return other === this;
    }

    metadataHash() {
        if (this.#hostPreopen) {
            return { upper: 0n, lower: BigInt(this._id) };
        }
        try {
            const stats = fstatSync(this.#fd, { bigint: true });
            return { upper: stats.mtimeNs, lower: stats.ino };
        } catch (e) {
            throw convertFsError(e);
        }
    }

    metadataHashAt(pathFlags, path) {
        const fullPath = this.#getFullPath(path, false);
        try {
            const stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(
                fullPath,
                {
                    bigint: true,
                }
            );
            return { upper: stats.mtimeNs, lower: stats.ino };
        } catch (e) {
            throw convertFsError(e);
        }
    }

    // TODO: support followSymlinks
    #getFullPath(subpath, _followSymlinks) {
        let descriptor = this;
        if (subpath.indexOf('\\') !== -1) {
            subpath = subpath.replace(/\\/g, '/');
        }
        if (subpath.indexOf('//') !== -1) {
            subpath = subpath.replace(/\/\/+/g, '/');
        }
        if (subpath[0] === '/') {
            throw 'not-permitted';
        }

        // segment resolution
        const segments = [];
        let segmentIndex = -1;
        for (let i = 0; i < subpath.length; i++) {
            // busy reading a segment - only terminate on '/'
            if (segmentIndex !== -1) {
                if (subpath[i] === '/') {
                    segments.push(subpath.slice(segmentIndex, i + 1));
                    segmentIndex = -1;
                }
                continue;
            }
            // new segment - check if it is relative
            else if (subpath[i] === '.') {
                // ../ segment
                if (
                    subpath[i + 1] === '.' &&
                    (subpath[i + 2] === '/' || i + 2 === subpath.length)
                ) {
                    if (segments.pop() === undefined) {
                        throw 'not-permitted';
                    }
                    i += 2;
                    continue;
                }
                // ./ segment
                else if (subpath[i + 1] === '/' || i + 1 === subpath.length) {
                    i += 1;
                    continue;
                }
            }
            // it is the start of a new segment
            while (subpath[i] === '/') {
                i++;
            }
            segmentIndex = i;
        }
        // finish reading out the last segment
        if (segmentIndex !== -1) {
            segments.push(subpath.slice(segmentIndex));
        }

        subpath = segments.join('');

        if (descriptor.#hostPreopen) {
            return (
                descriptor.#hostPreopen +
                (descriptor.#hostPreopen.endsWith('/')
                    ? ''
                    : subpath.length > 0
                        ? '/'
                        : '') +
                subpath
            );
        }
        return descriptor.#fullPath + (subpath.length > 0 ? '/' : '') + subpath;
    }
}
const descriptorCreatePreopen = Descriptor._createPreopen;
delete Descriptor._createPreopen;
const descriptorCreate = Descriptor._create;
delete Descriptor._create;

class DirectoryEntryStream {
    #dir;
    #finalizer;
    readDirectoryEntry() {
        let entry;
        try {
            entry = this.#dir.readSync();
        } catch (e) {
            throw convertFsError(e);
        }
        if (entry === null) {
            return null;
        }
        const name = entry.name;
        const type = lookupType(entry);
        return { name, type };
    }
    static _create(dir) {
        const dirStream = new DirectoryEntryStream();
        dirStream.#finalizer = registerDispose(
            dirStream,
            null,
            null,
            dir.closeSync.bind(dir)
        );
        dirStream.#dir = dir;
        return dirStream;
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}
const directoryEntryStreamCreate = DirectoryEntryStream._create;
delete DirectoryEntryStream._create;

let preopenEntries = [];

export const preopens = {
    Descriptor,
    getDirectories() {
        return preopenEntries;
    },
};

_addPreopen('/', isWindows ? '//' : '/');

export const types = {
    Descriptor,
    DirectoryEntryStream,
    filesystemErrorCode(err) {
        return convertFsError(err.payload);
    },
};

export function _setPreopens(preopens) {
    preopenEntries = [];
    for (const [virtualPath, hostPreopen] of Object.entries(preopens)) {
        _addPreopen(virtualPath, hostPreopen);
    }
}

export function _addPreopen(virtualPath, hostPreopen) {
    const preopenEntry = [descriptorCreatePreopen(hostPreopen), virtualPath];
    preopenEntries.push(preopenEntry);
}

function convertFsError(e) {
    switch (e.code) {
    case 'EACCES':
        return 'access';
    case 'EAGAIN':
    case 'EWOULDBLOCK':
        return 'would-block';
    case 'EALREADY':
        return 'already';
    case 'EBADF':
        return 'bad-descriptor';
    case 'EBUSY':
        return 'busy';
    case 'EDEADLK':
        return 'deadlock';
    case 'EDQUOT':
        return 'quota';
    case 'EEXIST':
        return 'exist';
    case 'EFBIG':
        return 'file-too-large';
    case 'EILSEQ':
        return 'illegal-byte-sequence';
    case 'EINPROGRESS':
        return 'in-progress';
    case 'EINTR':
        return 'interrupted';
    case 'EINVAL':
        return 'invalid';
    case 'EIO':
        return 'io';
    case 'EISDIR':
        return 'is-directory';
    case 'ELOOP':
        return 'loop';
    case 'EMLINK':
        return 'too-many-links';
    case 'EMSGSIZE':
        return 'message-size';
    case 'ENAMETOOLONG':
        return 'name-too-long';
    case 'ENODEV':
        return 'no-device';
    case 'ENOENT':
        return 'no-entry';
    case 'ENOLCK':
        return 'no-lock';
    case 'ENOMEM':
        return 'insufficient-memory';
    case 'ENOSPC':
        return 'insufficient-space';
    case 'ENOTDIR':
    case 'ERR_FS_EISDIR':
        return 'not-directory';
    case 'ENOTEMPTY':
        return 'not-empty';
    case 'ENOTRECOVERABLE':
        return 'not-recoverable';
    case 'ENOTSUP':
        return 'unsupported';
    case 'ENOTTY':
        return 'no-tty';
        // windows gives this error for badly structured `//` reads
        // this seems like a slightly better error than unknown given
        // that it's a common footgun
    case -4094:
    case 'ENXIO':
        return 'no-such-device';
    case 'EOVERFLOW':
        return 'overflow';
    case 'EPERM':
        return 'not-permitted';
    case 'EPIPE':
        return 'pipe';
    case 'EROFS':
        return 'read-only';
    case 'ESPIPE':
        return 'invalid-seek';
    case 'ETXTBSY':
        return 'text-file-busy';
    case 'EXDEV':
        return 'cross-device';
    case 'UNKNOWN':
        switch (e.errno) {
        case -4094:
            return 'no-such-device';
        default:
            throw e;
        }
    default:
        throw e;
    }
}

function timestampToMs(timestamp) {
    return Number(timestamp.seconds) * 1000 + timestamp.nanoseconds / 1e9;
}
