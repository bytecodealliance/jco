import { _io } from './io.js';
import { environment } from './cli.js';
import { constants, readSync, openSync, opendirSync, closeSync, fstatSync, lstatSync, statSync, writeSync } from 'node:fs';
import { platform } from 'node:process';

const isWindows = platform === 'win32';

class ReadableFileStream {
  constructor (hostFd, position) {
    this.hostFd = hostFd;
    this.position = Number(position);
  }
  read (len) {
    const buf = new Uint8Array(Number(len));
    const bytesRead = readSync(this.hostFd, buf, 0, buf.byteLength, this.position);
    this.position += bytesRead;
    if (bytesRead < buf.byteLength)
      return [new Uint8Array(buf.buffer, 0, bytesRead), bytesRead === 0 ? 'ended' : 'open'];
    return [buf, 'open'];
  }
}

class WriteableFileStream {
  constructor (hostFd, position) {
    this.hostFd = hostFd;
    this.position = Number(position);
  }
  write (contents) {
    let totalWritten = 0;
    while (totalWritten !== contents.byteLength) {
      const bytesWritten = writeSync(this.hostFd, contents, null, null, this.position);
      totalWritten += bytesWritten;
      contents = new Uint8Array(contents.buffer, bytesWritten);
    }
    this.position += contents.byteLength;
  }
}

class DirStream {
  constructor (dir) {
    this.dir = dir;
  }
  read () {
    let entry;
    try {
      entry = this.dir.readSync();
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
  drop () {
    this.dir.closeSync();
  }
}

const nsMagnitude = 1_000_000_000_000n;
function nsToDateTime (ns) {
  const seconds = ns / nsMagnitude;
  const nanoseconds = Number(ns % seconds);
  return { seconds, nanoseconds };
}

function lookupType (obj) {
  if (obj.isFile())
    return 'regular-file';
  else if (obj.isSocket())
    return 'socket';
  else if (obj.isSymbolicLink())
    return 'symbolic-link';
  else if (obj.isFIFO())
    return 'fifo';
  else if (obj.isDirectory())
    return 'directory';
  else if (obj.isCharacterDevice())
    return 'character-device';
  else if (obj.isBlockDevice())
    return 'block-device';
  return 'unknown';
}

/**
 * @typedef {
 *   { stream: number } |
 *   { hostPreopen: string } |
 *   { fullPath: string, fd: number }
 * } Descriptor
 */
export class FileSystem {
  getDescriptor (fd) {
    const descriptor = this.descriptors[fd];
    if (!descriptor) throw 'bad-descriptor';
    return descriptor;
  }

  // Note: This should implement per-segment semantics of openAt, but we cannot currently
  //       due to the lack of support for openat() in Node.js.
  //       Tracking issue: https://github.com/libuv/libuv/issues/4167

  // TODO: support followSymlinks
  getFullPath (fd, subpath, _followSymlinks) {
    if (subpath.indexOf('\\') !== -1)
      subpath = subpath.replace(/\\/g, '/');
    if (subpath[0] === '/') {
      let bestPreopenMatch = '';
      for (const preopenEntry of this.preopenEntries) {
        if (subpath.startsWith(preopenEntry[1]) && (!bestPreopenMatch || bestPreopenMatch.length < preopenEntry[1].length)) {
          bestPreopenMatch = preopenEntry;
        }
      }
      if (!bestPreopenMatch)
        throw 'no-entry';
      fd = bestPreopenMatch[0];
      subpath = subpath.slice(bestPreopenMatch[1]);
      if (subpath[0] === '/')
        subpath = subpath.slice(1);
    }
    if (subpath.startsWith('.'))
      subpath = subpath.slice(subpath[1] === '/' ? 2 : 1);
    const descriptor = this.getDescriptor(fd);
    if (descriptor.hostPreopen)
      return descriptor.hostPreopen + (descriptor.hostPreopen.endsWith('/') ? '' : '/') + subpath;
    return descriptor.fullPath + '/' + subpath;
  }

  /**
   * 
   * @param {import('./io.js').Io} io 
   * @param {[string, string][]} preopens 
   * @returns 
   */
  constructor (io, preopens, environment) {
    this.cwd = environment.initialCwd();
    // io always has streams 0, 1, 2 as stdio streams
    this.descriptorCnt = 3;
    /**
     * @type {Record<number, Descriptor>}
     */
    this.descriptors = {
      0: { stream: 0 },
      1: { stream: 1 },
      2: { stream: 2 },
    };
    this.preopenEntries = [];
    for (const [virtualPath, hostPreopen] of Object.entries(preopens)) {
      const preopenEntry = [this.descriptorCnt, virtualPath];
      this.preopenEntries.push(preopenEntry);
      this.descriptors[this.descriptorCnt++] = { hostPreopen };
    }
    const fs = this;
    this.preopens = {
      getDirectories () {
        return fs.preopenEntries;
      }
    };
    this.types = {
      readViaStream(fd, offset) {
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream)
          return descriptor.stream;
        if (descriptor.hostPreopen)
          throw 'is-directory';
        return io.createStream(new ReadableFileStream(descriptor.fd, offset));
      },
    
      writeViaStream(fd, offset) {
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream)
          return descriptor.stream;
        if (descriptor.hostPreopen)
          throw 'is-directory';
        return io.createStream(new WriteableFileStream(descriptor.fd, offset));
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
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream) return 'fifo';
        if (descriptor.hostPreopen) return 'directory';
        const stats = fstatSync(descriptor.fd);
        return lookupType(stats);
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
        const descriptor = fs.getDescriptor(fd);
        if (!descriptor.fullPath) throw 'bad-descriptor';
        const buf = new Uint8Array(length);
        const bytesRead = readSync(descriptor.fd, buf, offset, length, 0);
        const out = new Uint8Array(buf.buffer, 0, bytesRead);
        return [out, bytesRead === 0 ? 'ended' : 'open'];
      },

      write(fd, buffer, offset) {
        const descriptor = fs.getDescriptor(fd);
        if (!descriptor.fullPath) throw 'bad-descriptor';
        return BigInt(writeSync(descriptor.fd, buffer, Number(offset), buffer.byteLength - offset, 0));
      },

      readDirectory(fd) {
        const descriptor = fs.getDescriptor(fd);
        if (!descriptor.fullPath) throw 'bad-descriptor';
        try {
          const dir = opendirSync(isWindows ? descriptor.fullPath.slice(1) : descriptor.fullPath);
          return io.createStream(new DirStream(dir));
        }
        catch (e) {
          throw convertFsError(e);
        }
      },

      sync(fd) {
        console.log(`[filesystem] SYNC`, fd);
      },
    
      createDirectoryAt(fd, path) {
        const entry = fs.getOrCreateChildDescriptor(fd, path, { create: true, directory: true });
        if (entry.source) throw 'exist';
      },

      stat(fd) {
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream || descriptor.hostPreopen) throw 'invalid';
        let stats;
        try {
          stats = fstatSync(descriptor.fd, { bigint: true });
        }
        catch (e) {
          convertFsError(e);
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
      },

      statAt(fd, pathFlags, path) {
        const fullPath = fs.getFullPath(fd, path, false);
        let stats;
        try {
          stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(isWindows ? fullPath.slice(1) : fullPath, { bigint: true });
        }
        catch (e) {
          convertFsError(e);
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
      },

      setTimesAt(fd) {
        console.log(`[filesystem] SET TIMES AT`, fd);
      },

      linkAt(fd) {
        console.log(`[filesystem] LINK AT`, fd);
      },

      openAt(fd, pathFlags, path, openFlags, descriptorFlags, modes) {
        const fullPath = fs.getFullPath(fd, path, pathFlags.symlinkFollow);
        const childFd = fs.descriptorCnt++;
        let fsOpenFlags = 0x0;
        if (openFlags.create)
          fsOpenFlags |= constants.O_CREAT;
        if (openFlags.directory)
          fsOpenFlags |= constants.O_DIRECTORY;
        if (openFlags.exclusive)
          fsOpenFlags |= constants.O_EXCL;
        if (openFlags.truncate)
          fsOpenFlags |= constants.O_TRUNC;

        if (descriptorFlags.read && descriptorFlags.write)
          fsOpenFlags |= constants.O_RDWR;
        else if (descriptorFlags.write)
          fsOpenFlags |= constants.O_WRONLY;
        // TODO:
        // if (descriptorFlags.fileIntegritySync)
        // if (descriptorFlags.dataIntegritySync)
        // if (descriptorFlags.requestedWriteSync)
        // if (descriptorFlags.mutateDirectory)

        let fsMode = 0x0;
        if (modes.readable)
          fsMode |= 0o444;
        if (modes.writeable)
          fsMode |= 0o222;
        if (modes.executable)
          fsMode |= 0o111;

        try {
          const fd = openSync(isWindows ? fullPath.slice(1) : fullPath, fsOpenFlags, fsMode);
          fs.descriptors[childFd] = { fullPath, fd };
        }
        catch (e) {
          throw convertFsError(e);
        }
        return childFd;
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
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.fd)
          closeSync(descriptor.fd);
        delete fs.descriptors[fd];
      },

      readDirectoryEntry(sid) {
        return io.getStream(sid).read();
      },

      dropDirectoryEntryStream(sid) {
        io.dropStream(sid);
      },

      metadataHash(fd) {
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream)
          return { upper: 0n, lower: descriptor.stream}
        if (descriptor.hostPreopen)
          return { upper: 0n, lower: BigInt(fd) };
        try {
          const stats = fstatSync(descriptor.fd, { bigint: true });
          return { upper: stats.mtimeNs, lower: stats.ino };
        }
        catch (e) {
          convertFsError(e);
        }
      },

      metadataHashAt(fd, pathFlags, path) {
        const fullPath = fs.getFullPath(fd, path, false);
        try {
          const stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(isWindows ? fullPath.slice(1) : fullPath, { bigint: true });
          return { upper: stats.mtimeNs, lower: stats.ino };
        }
        catch (e) {
          convertFsError(e);
        }
      }
    };
  }
}

const _fs = new FileSystem(_io, { '/': '/' }, environment);

export const { preopens, types } = _fs;

function convertFsError (e) {
  switch (e.code) {
    case 'EACCES': throw 'access';
    case 'EAGAIN':
    case 'EWOULDBLOCK': throw 'would-block';
    case 'EALREADY': throw 'already';
    case 'EBADF': throw 'bad-descriptor';
    case 'EBUSY': throw 'busy';
    case 'EDEADLK': throw 'deadlock';
    case 'EDQUOT': throw 'quota';
    case 'EEXIST': throw 'exist';
    case 'EFBIG': throw 'file-too-large';
    case 'EILSEQ': throw 'illegal-byte-sequence';
    case 'EINPROGRESS': throw 'in-progress';
    case 'EINTR': throw 'interrupted';
    case 'EINVAL': throw 'invalid';
    case 'EIO': throw 'io';
    case 'EISDIR': throw 'is-directory';
    case 'ELOOP': throw 'loop';
    case 'EMLINK': throw 'too-many-links';
    case 'EMSGSIZE': throw 'message-size';
    case 'ENAMETOOLONG': throw 'name-too-long'
    case 'ENODEV': throw 'no-device';
    case 'ENOENT': throw 'no-entry';
    case 'ENOLCK': throw 'no-lock';
    case 'ENOMEM': throw 'insufficient-memory';
    case 'ENOSPC': throw 'insufficient-space';
    case 'ENOTDIR': throw 'not-directory';
    case 'ENOTEMPTY': throw 'not-empty';
    case 'ENOTRECOVERABLE': throw 'not-recoverable';
    case 'ENOTSUP': throw 'unsupported';
    case 'ENOTTY': throw 'no-tty';
    case 'ENXIO': throw 'no-such-device';
    case 'EOVERFLOW': throw 'overflow';
    case 'EPERM': throw 'not-permitted';
    case 'EPIPE': throw 'pipe';
    case 'EROFS': throw 'read-only';
    case 'ESPIPE': throw 'invalid-seek';
    case 'ETXTBSY': throw 'text-file-busy';
    case 'EXDEV': throw 'cross-device';
    default: throw e;
  }
}
