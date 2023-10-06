import { _io } from './io.js';
import { environment } from './cli.js';

const { createStream, getStream, dropStream } = _io;

let _preopens = [[3, '/']], _rootPreopen = _preopens[0];

export function _setPreopens (preopens) {
  _preopens = preopens;
  descriptorCnt = 3 + _preopens.length;
  _rootPreopen = _preopens.find(preopen => preopen[1] === '/');
}

let _cwd = null;

export function _setCwd (cwd) {
  _cwd = cwd;
}

export function _setFileData (fileData) {
  _fileData = fileData;
  _setPreopens(Object.keys(fileData).map((key) => {
    const fd = descriptorCnt++;
    descriptorTable[fd] = { entry: fileData[key] };
    return [fd, key];
  }));
  const cwd = environment.initialCwd();
  _setCwd(cwd || '/');
}

export function _getFileData () {
  return JSON.stringify(_fileData);
}

let _fileData = {};

let descriptorCnt = 4;
const descriptorTable = {
  0: { stream: 0 },
  1: { stream: 1 },
  2: { stream: 2 },
  3: { entry: { dir: {} } },
};

const timeZero = {
  seconds: BigInt(0),
  nanoseconds: 0
};

function getDescriptor (fd) {
  const descriptor = descriptorTable[fd];
  if (!descriptor) throw 'bad-descriptor';
  return descriptor;
}

function getChildEntry (fd, subpath, openFlags) {
  if (subpath === '.' && _rootPreopen && _rootPreopen[0] === fd) {
    subpath = _cwd;
    if (subpath.startsWith('/'))
      subpath = subpath.slice(1);
  }
  let entry = getDescriptor(fd)?.entry;
  let segmentIdx;
  do {
    if (!entry || !entry.dir) throw 'not-directory';
    segmentIdx = subpath.indexOf('/');
    const segment = segmentIdx === -1 ? subpath : subpath.slice(0, segmentIdx);
    if (segment === '.' || segment === '') return entry;
    if (segment === '..') throw 'no-entry';
    if (!entry.dir[segment] && openFlags.create)
      entry = entry.dir[segment] = openFlags.directory ? { dir: {} } : { source: new Uint8Array([]) };
    else
      entry = entry.dir[segment];
  } while (segmentIdx !== -1)
  if (!entry) throw 'no-entry';
  return entry;
}

function createChildDescriptor (fd, subpath, openFlags) {
  const entry = getChildEntry(fd, subpath, openFlags);
  const childFd = descriptorCnt++;
  descriptorTable[childFd] = { entry };
  return childFd;
}

function getSource (fileEntry) {
  if (typeof fileEntry.source === 'string') {
    fileEntry.source = new TextEncoder().encode(fileEntry.source);
  }
  return fileEntry.source;
}

class DirStream {
  constructor (entries) {
    this.idx = 0;
    this.entries = entries;
  }
  next () {
    if (this.idx === this.entries.length)
      return null;
    const [name, entry] = this.entries[this.idx];
    this.idx += 1;
    return {
      name,
      type: entry.dir ? 'directory' : 'regular-file'
    };
  }
}

export const preopens = {
  getDirectories () {
    return _preopens;
  }
}

export const types = {
  readViaStream(fd, offset) {
    const descriptor = getDescriptor(fd);
    const source = getSource(descriptor.entry);
    return createStream({
      i: Number(offset),
      source,
      read (len) {
        const bytes = this.source.slice(this.i, this.i + Number(len));
        this.i += bytes.byteLength;
        return [bytes, this.i === this.source.byteLength ? 'ended' : 'open'];
      }
    });
  },

  writeViaStream(fd, offset) {
    const descriptor = getDescriptor(fd);
    return createStream({
      i: Number(offset),
      entry: descriptor.entry,
      write (buf) {
        const newSource = new Uint8Array(buf.byteLength + this.entry.source.byteLength);
        newSource.set(this.entry.source, 0);
        newSource.set(buf, this.i);
        this.i += buf.byteLength;
        this.entry.source = newSource;
        return buf.byteLength;
      }
    });
  },

  appendViaStream(fd) {
    console.log(`[filesystem] APPEND STREAM ${fd}`);
  },

  advise(fd, offset, length, advice) {
    console.log(`[filesystem] ADVISE`, fd, offset, length, advice);
  },

  syncData(fd) {
    console.log(`[filesystem] SYNC DATA ${fd}`);
  },

  getFlags(fd) {
    console.log(`[filesystem] FLAGS FOR ${fd}`);
  },

  getType(fd) {
    if (fd < 3) return 'fifo';
    const descriptor = getDescriptor(fd);
    if (descriptor.stream) return 'fifo';
    if (descriptor.entry.dir) return 'directory';
    if (descriptor.entry.source) return 'regular-file';
    return 'unknown';
  },

  setFlags(fd, flags) {
    console.log(`[filesystem] SET FLAGS ${fd} ${JSON.stringify(flags)}`);
  },

  setSize(fd, size) {
    console.log(`[filesystem] SET SIZE`, fd, size);
  },

  setTimes(fd, dataAccessTimestamp, dataModificationTimestamp) {
    console.log(`[filesystem] SET TIMES`, fd, dataAccessTimestamp, dataModificationTimestamp);
  },

  read(fd, length, offset) {
    const descriptor = getDescriptor(fd);
    const source = getSource(descriptor.entry);
    return [source.slice(offset, offset + length), offset + length >= source.byteLength];
  },

  write(fd, buffer, offset) {
    const descriptor = getDescriptor(fd);
    if (offset !== 0) throw 'invalid-seek';
    descriptor.entry.source = buffer;
    return buffer.byteLength;
  },

  readDirectory(fd) {
    const descriptor = getDescriptor(fd);
    if (!descriptor?.entry?.dir) throw 'bad-descriptor';
    return createStream(new DirStream(Object.entries(descriptor.entry.dir).sort(([a], [b]) => a > b ? 1 : -1)));
  },

  sync(fd) {
    console.log(`[filesystem] SYNC`, fd);
  },

  createDirectoryAt(fd, path) {
    const entry = getChildEntry(fd, path, { create: true, directory: true });
    if (entry.source) throw 'exist';
  },

  stat(fd) {
    const descriptor = getDescriptor(fd);
    let type = 'unknown', size = BigInt(0);
    if (descriptor.entry.source) {
      type = 'directory';
    }
    else if (descriptor.entry.dir) {
      type = 'regular-file';
      const source = getSource(descriptor.entry);
      size = BigInt(source.byteLength);
    }
    return {
      type,
      linkCount: BigInt(0),
      size,
      dataAccessTimestamp: timeZero,
      dataModificationTimestamp: timeZero,
      statusChangeTimestamp: timeZero,
    }
  },
  
  statAt(fd, pathFlags, path) {
    const entry = getChildEntry(fd, path);
    let type = 'unknown', size = BigInt(0);
    if (entry.source) {
      type = 'regular-file';
      const source = getSource(entry);
      size = BigInt(source.byteLength);
    }
    else if (entry.dir) {
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
  },

  setTimesAt(fd) {
    console.log(`[filesystem] SET TIMES AT`, fd);
  },

  linkAt(fd) {
    console.log(`[filesystem] LINK AT`, fd);
  },

  openAt(fd, _pathFlags, path, openFlags, _descriptorFlags, _modes) {
    return createChildDescriptor(fd, path, openFlags);
  },

  readlinkAt(fd) {
    console.log(`[filesystem] READLINK AT`, fd);
  },

  removeDirectoryAt(fd) {
    console.log(`[filesystem] REMOVE DIR AT`, fd);
  },

  renameAt(fd) {
    console.log(`[filesystem] RENAME AT`, fd);
  },

  symlinkAt(fd) {
    console.log(`[filesystem] SYMLINK AT`, fd);
  },

  unlinkFileAt(fd) {
    console.log(`[filesystem] UNLINK FILE AT`, fd);
  },

  changeFilePermissionsAt(fd) {
    console.log(`[filesystem] CHANGE FILE PERMISSIONS AT`, fd);
  },

  changeDirectoryPermissionsAt(fd) {
    console.log(`[filesystem] CHANGE DIR PERMISSIONS AT`, fd);
  },

  lockShared(fd) {
    console.log(`[filesystem] LOCK SHARED`, fd);
  },

  lockExclusive(fd) {
    console.log(`[filesystem] LOCK EXCLUSIVE`, fd);
  },

  tryLockShared(fd) {
    console.log(`[filesystem] TRY LOCK SHARED`, fd);
  },

  tryLockExclusive(fd) {
    console.log(`[filesystem] TRY LOCK EXCLUSIVE`, fd);
  },

  unlock(fd) {
    console.log(`[filesystem] UNLOCK`, fd);
  },

  dropDescriptor(fd) {
    if (fd < _preopens.length + 3)
      return;
    delete descriptorTable[fd];
  },

  readDirectoryEntry(sid) {
    return getStream(sid).next();
  },

  dropDirectoryEntryStream(sid) {
    dropStream(sid);
  },

  metadataHash(fd) {
    const descriptor = getDescriptor(fd);
    let upper = BigInt(0);
    upper += BigInt(descriptor.mtime || 0);
    return { upper, lower: BigInt(0) };
  },

  metadataHashAt(fd, _pathFlags, _path) {
    const descriptor = getDescriptor(fd);
    let upper = BigInt(0);
    upper += BigInt(descriptor.mtime || 0);
    return { upper, lower: BigInt(0) };
  }
};

export { types as filesystemTypes }