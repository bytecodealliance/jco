import { _io } from './io.js';
import { environment } from './cli.js';
import { constants, readSync, openSync, closeSync, fstatSync, lstatSync, statSync, writeSync } from 'node:fs';
import { platform } from 'node:process';

const isWindows = platform === 'win32';

class ReadableFileStream {
  constructor (hostFd, position) {
    this.hostFd = hostFd;
    this.position = position;
  }
  read (len) {
    const buf = new Uint8Array(Number(len));
    const bytesRead = readSync(this.hostFd, buf, this.position ? { position: this.position } : undefined);
    this.position = null;
    if (bytesRead < buf.byteLength)
      return [new Uint8Array(buf.buffer, 0, bytesRead), bytesRead === 0 ? 'ended' : 'open'];
    return [buf, 'ended'];
  }
}

class WriteableFileStream {
  constructor (hostFd, position) {
    this.hostFd = hostFd;
    this.position = position;
  }
  write (contents) {
    writeSync(this.hostFd, contents, null, null, this.position || undefined);
  }
}

class DirStream {
  constructor (entries) {
    this.idx = 0;
    this.entries = entries;
  }
  read () {
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
 *   { dir: { fullPath: string, fd: number } } |
 *   { file: { fullPath: string, fd: number } }
 * } Descriptor
 */
export class FileSystem {
  getDescriptor (fd) {
    const descriptor = this.descriptors[fd];
    if (!descriptor) throw 'bad-descriptor';
    return descriptor;
  }

  // Note: Strictly speaking, this should implement per-segment semantics of openAt
  //       virtualization, but for now we treat this as an unimplemented security property
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
    if (!descriptor.dir) throw 'not-directory';
    
    // let segmentIdx;
    // do {
    //   segmentIdx = subpath.indexOf('/');
    //   const segment = segmentIdx === -1 ? subpath : subpath.slice(0, segmentIdx);
    //   if (segment === '.' || segment === '') return fd;
    //   if (segment === '..') throw 'no-entry';
    //   if (!entry.dir[segment] && openFlags.create)
    //     entry = entry.dir[segment] = openFlags.directory ? { dir: {} } : { source: new Uint8Array([]) };
    //   else
    //     entry = entry.dir[segment];
    // } while (segmentIdx !== -1)
    // if (!entry) throw 'no-entry';
    // return entry;
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
        if (descriptor.hostPreopen || descriptor.dir)
          throw 'is-directory';
        if (descriptor.file)
          return io.createStream(new ReadableFileStream(descriptor.file.fd, offset));
      },
    
      writeViaStream(fd, offset) {
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream)
          return descriptor.stream;
        if (descriptor.hostPreopen || descriptor.dir)
          throw 'is-directory';
        if (descriptor.file)
          return io.createStream(new WriteableFileStream(descriptor.file.fd, offset));
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
        const descriptor = fs.getDescriptor(fd);
        if (descriptor.stream) return 'fifo';
        if (descriptor.hostPreopen) return 'directory';
        if (descriptor.dir) return 'regular-file';
        if (descriptor.file) return 'regular-file';
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
        const descriptor = fs.getDescriptor(fd);
        if (!descriptor.file) throw 'bad-descriptor';
        const buf = new Uint8Array(length);
        const bytesRead = readSync(descriptor.file.fd, buf, offset, length, 0);
        const out = new Uint8Array(buf.buffer, 0, bytesRead);
        const done = bytesRead === 0;
        return [out, done];
      },

      write(fd, buffer, offset) {
        console.log('WRITE');
        const descriptor = fs.getDescriptor(fd);
        if (offset !== 0) throw 'invalid-seek';
        descriptor.entry.source = buffer;
        return buffer.byteLength;
      },

      readDirectory(fd) {
        const descriptor = fs.getDescriptor(fd);
        if (!descriptor.dir) throw 'bad-descriptor';
        return io.createStream(new DirStream(Object.entries(descriptor.entry.dir).sort(([a], [b]) => a > b ? 1 : -1)));
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
        const hostFd = descriptor.dir ? descriptor.dir.fd : descriptor.file.fd;
        let stats;
        try {
          stats = fstatSync(hostFd, { bigint: true });
        }
        catch (e) {
          convertFsError(e);
        }
        const type = lookupType(stats);
        return {
          device: stats.dev,
          inode: stats.ino,
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
          stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(fullPath, { bigint: true });
        }
        catch (e) {
          convertFsError(e);
        }
        const type = lookupType(stats);
        return {
          device: stats.dev,
          inode: stats.ino,
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
          fs.descriptors[childFd] = { file: { fullPath, fd } };
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
        if (descriptor.file)
          closeSync(descriptor.file.fd);
        if (descriptor.dir)
          closeSync(descriptor.dir.fd);
        delete fs.descriptors[fd];
      },

      readDirectoryEntry(sid) {
        return io.getStream(sid).next();
      },

      dropDirectoryEntryStream(sid) {
        io.dropStream(sid);
      },

      metadataHash(fd) {
        const stats = fs.types.stat(fd);
        const upper = BigInt(stats.dataModificationTimestamp.seconds);
        return { upper, lower: BigInt(0) };
      },

      metadataHashAt(fd, pathFlags, path) {
        const stats = fs.types.statAt(fd, pathFlags, path);
        const upper = BigInt(stats.dataModificationTimestamp.seconds);
        return { upper, lower: BigInt(0) };
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

// export let _streams = {};
// let streamCnt = 0;
// export function _createFsStream(fd, type, context) {
//   _streams[streamCnt] = {
//     type,
//     fd,
//     context
//   };
//   return streamCnt++;
// }

// export function _getFsStreamContext(stream, type) {
//   const entry = _streams[stream];
//   if (!entry)
//     throw new Error(`No '${type}' stream found at stream ${stream}`);
//   if (entry.type !== type)
//     throw new Error(`Unexpected '${entry.type}' stream found at stream ${stream}, expected '${type}'`);
//   return entry.context;
// }

// export function _dropFsStream(stream) {
//   // TODO: recycling?
//   delete _streams[stream];
// }

// export const streams = {
//   read(s, len) {
//     return streams.blockingRead(s, len);
//   },
//   blockingRead(s, len) {
//     len = Number(len);
//     const stream = _streams[s];
//     switch (stream?.type) {
//       case 'file': {
//         const buf = Buffer.alloc(Number(len));
//         try {
//           const readBytes = fsReadSync(stream.fd, buf, 0, Number(len));
//           if (readBytes < Number(len)) {
//             return [new Uint8Array(buf.buffer, 0, readBytes), 'ended'];
//           }
//           return [new Uint8Array(buf.buffer, 0, readBytes), 'open'];
//         }
//         catch (e) {
//           _convertFsError(e);
//         }
//         break;
//       }
//     }
//     throw null;
//   },
//   skip(s, _len) {
//     console.log(`[streams] Skip ${s}`);
//   },
//   blockingSkip(s, _len) {
//     console.log(`[streams] Blocking skip ${s}`);
//   },
//   subscribeToInputStream(s) {
//     console.log(`[streams] Subscribe to input stream ${s}`);
//   },
//   dropInputStream(s) {
//     delete _streams[s];
//   },
//   checkWrite(_s) {
//     // TODO: implement
//     return 1000000n;
//   },
//   write(s, buf) {
//     switch (s) {
//       case 0:
//         throw new Error(`TODO: write stdin`);
//       case 1: {
//         process.stdout.write(buf);
//         break;
//       }
//       case 2: {
//         process.stderr.write(buf);
//         break;
//       }
//       default:
//         throw new Error(`TODO: write ${s}`);
//     }
//   },
//   blockingWriteAndFlush(s, buf) {
//     // TODO: implement
//     return streams.write(s, buf);
//   },
//   flush(s) {
//     return streams.blockingFlush(s);
//   },
//   blockingFlush(_s) {
//     // TODO: implement
//   },
//   writeZeroes(s, _len) {
//     console.log(`[streams] Write zeroes ${s}`);
//   },
//   blockingWriteZeroes(s, _len) {
//     console.log(`[streams] Blocking write zeroes ${s}`);
//   },
//   splice(s, _src, _len) {
//     console.log(`[streams] Splice ${s}`);
//   },
//   blockingSplice(s, _src, _len) {
//     console.log(`[streams] Blocking splice ${s}`);
//   },
//   forward(s, _src) {
//     console.log(`[streams] Forward ${s}`);
//   },
//   subscribeToOutputStream(s) {
//     console.log(`[streams] Subscribe to output stream ${s}`);
//   },
//   dropOutputStream(s) {
//     console.log(`[streams] Drop output stream ${s}`);
//   }
// };
