import { streams } from './io.js';
import { environment } from './environment.js';

import { _setCwd, _getCwd } from './config.js';
export { _setCwd } from './config.js';

const { InputStream, OutputStream } = streams;

export function _setFileData(fileData) {
    _fileData = fileData;
    _rootPreopen[0] = new Descriptor(fileData);
    const cwd = environment.initialCwd();
    _setCwd(cwd || '/');
}

export function _getFileData() {
    return JSON.stringify(_fileData);
}

let _fileData = { dir: {} };

const timeZero = {
    seconds: BigInt(0),
    nanoseconds: 0,
};

function getChildEntry(parentEntry, subpath, openFlags) {
    if (
        subpath === '.' &&
        _rootPreopen &&
        descriptorGetEntry(_rootPreopen[0]) === parentEntry
    ) {
        subpath = _getCwd();
        if (subpath.startsWith('/') && subpath !== '/') {
            subpath = subpath.slice(1);
        }
    }
    let entry = parentEntry;
    let segmentIdx;
    do {
        if (!entry || !entry.dir) {
            throw 'not-directory';
        }
        segmentIdx = subpath.indexOf('/');
        const segment =
            segmentIdx === -1 ? subpath : subpath.slice(0, segmentIdx);
        if (segment === '..') {
            throw 'no-entry';
        }
        if (segment === '.' || segment === '') {
        } else if (!entry.dir[segment] && openFlags.create) {
            entry = entry.dir[segment] = openFlags.directory
                ? { dir: {} }
                : { source: new Uint8Array([]) };
        } else {
            entry = entry.dir[segment];
        }
        subpath = subpath.slice(segmentIdx + 1);
    } while (segmentIdx !== -1);
    if (!entry) {
        throw 'no-entry';
    }
    return entry;
}

function getSource(fileEntry) {
    if (typeof fileEntry.source === 'string') {
        fileEntry.source = new TextEncoder().encode(fileEntry.source);
    }
    return fileEntry.source;
}

class DirectoryEntryStream {
    constructor(entries) {
        this.idx = 0;
        this.entries = entries;
    }
    readDirectoryEntry() {
        if (this.idx === this.entries.length) {
            return null;
        }
        const [name, entry] = this.entries[this.idx];
        this.idx += 1;
        return {
            name,
            type: entry.dir ? 'directory' : 'regular-file',
        };
    }
}

class Descriptor {
    #stream;
    #entry;
    #mtime = 0;

    _getEntry(descriptor) {
        return descriptor.#entry;
    }

    constructor(entry, isStream) {
        if (isStream) {
            this.#stream = entry;
        } else {
            this.#entry = entry;
        }
    }

    readViaStream(_offset) {
        const source = getSource(this.#entry);
        let offset = Number(_offset);
        return new InputStream({
            blockingRead(len) {
                if (offset === source.byteLength) {
                    throw { tag: 'closed' };
                }
                const bytes = source.slice(offset, offset + Number(len));
                offset += bytes.byteLength;
                return bytes;
            },
        });
    }

    writeViaStream(_offset) {
        const entry = this.#entry;
        let offset = Number(_offset);
        return new OutputStream({
            write(buf) {
                const newSource = new Uint8Array(
                    buf.byteLength + entry.source.byteLength
                );
                newSource.set(entry.source, 0);
                newSource.set(buf, offset);
                offset += buf.byteLength;
                entry.source = newSource;
                return buf.byteLength;
            },
        });
    }

    appendViaStream() {
        console.log(`[filesystem] APPEND STREAM`);
    }

    advise(descriptor, offset, length, advice) {
        console.log(`[filesystem] ADVISE`, descriptor, offset, length, advice);
    }

    syncData() {
        console.log(`[filesystem] SYNC DATA`);
    }

    getFlags() {
        console.log(`[filesystem] FLAGS FOR`);
    }

    getType() {
        if (this.#stream) {
            return 'fifo';
        }
        if (this.#entry.dir) {
            return 'directory';
        }
        if (this.#entry.source) {
            return 'regular-file';
        }
        return 'unknown';
    }

    setSize(size) {
        console.log(`[filesystem] SET SIZE`, size);
    }

    setTimes(dataAccessTimestamp, dataModificationTimestamp) {
        console.log(
            `[filesystem] SET TIMES`,
            dataAccessTimestamp,
            dataModificationTimestamp
        );
    }

    read(length, offset) {
        const source = getSource(this.#entry);
        return [
            source.slice(offset, offset + length),
            offset + length >= source.byteLength,
        ];
    }

    write(buffer, offset) {
        if (offset !== 0) {
            throw 'invalid-seek';
        }
        this.#entry.source = buffer;
        return buffer.byteLength;
    }

    readDirectory() {
        if (!this.#entry?.dir) {
            throw 'bad-descriptor';
        }
        return new DirectoryEntryStream(
            Object.entries(this.#entry.dir).sort(([a], [b]) => (a > b ? 1 : -1))
        );
    }

    sync() {
        console.log(`[filesystem] SYNC`);
    }

    createDirectoryAt(path) {
        const entry = getChildEntry(this.#entry, path, {
            create: true,
            directory: true,
        });
        if (entry.source) {
            throw 'exist';
        }
    }

    stat() {
        let type = 'unknown',
            size = BigInt(0);
        if (this.#entry.source) {
            type = 'regular-file';
            const source = getSource(this.#entry);
            size = BigInt(source.byteLength);
        } else if (this.#entry.dir) {
            type = 'directory';
        }
        return {
            type,
            linkCount: BigInt(0),
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    statAt(_pathFlags, path) {
        const entry = getChildEntry(this.#entry, path, {
            create: false,
            directory: false,
        });
        let type = 'unknown',
            size = BigInt(0);
        if (entry.source) {
            type = 'regular-file';
            const source = getSource(entry);
            size = BigInt(source.byteLength);
        } else if (entry.dir) {
            type = 'directory';
        }
        return {
            type,
            linkCount: BigInt(0),
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    setTimesAt() {
        console.log(`[filesystem] SET TIMES AT`);
    }

    linkAt() {
        console.log(`[filesystem] LINK AT`);
    }

    openAt(_pathFlags, path, openFlags, _descriptorFlags, _modes) {
        const childEntry = getChildEntry(this.#entry, path, openFlags);
        return new Descriptor(childEntry);
    }

    readlinkAt() {
        console.log(`[filesystem] READLINK AT`);
    }

    removeDirectoryAt() {
        console.log(`[filesystem] REMOVE DIR AT`);
    }

    renameAt() {
        console.log(`[filesystem] RENAME AT`);
    }

    symlinkAt() {
        console.log(`[filesystem] SYMLINK AT`);
    }

    unlinkFileAt() {
        console.log(`[filesystem] UNLINK FILE AT`);
    }

    isSameObject(other) {
        return other === this;
    }

    metadataHash() {
        let upper = BigInt(0);
        upper += BigInt(this.#mtime);
        return { upper, lower: BigInt(0) };
    }

    metadataHashAt(_pathFlags, _path) {
        let upper = BigInt(0);
        upper += BigInt(this.#mtime);
        return { upper, lower: BigInt(0) };
    }
}
const descriptorGetEntry = Descriptor.prototype._getEntry;
delete Descriptor.prototype._getEntry;

let _preopens = [[new Descriptor(_fileData), '/']],
    _rootPreopen = _preopens[0];

export const preopens = {
    getDirectories() {
        return _preopens;
    },
};

export const types = {
    Descriptor,
    DirectoryEntryStream,
    filesystemErrorCode(err) {
        return convertFsError(err.payload);
    },
};

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

export { types as filesystemTypes };
