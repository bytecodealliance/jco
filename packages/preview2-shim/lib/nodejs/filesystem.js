import { openSync, constants, statSync, lstatSync, fstatSync, closeSync, readdirSync } from 'node:fs';
import { _createFsStream, _dropFsStream, _getFsStreamContext } from './io.js';

// default is full permissions
let preopenCnt = 4;
export let _descriptors = {
  3: { type: 'directory', path: '/', parent: null, subpathTypes: {} }
};
let directories = [[3, '/']];

export function _setPreopens (preopens) {
  _descriptors = {};
  directories = [,,];
  for (const [virtualPath, path] of Object.entries(preopens)) {
    _descriptors[preopenCnt] = { type: 'directory', path, parent: null, subpathTypes: {} };
    directories.push([preopenCnt++, virtualPath]);
  }
}

export function _getFullPath (fd) {
  let path = '';
  while (fd) {
    path = _descriptors[fd].path + path;
    fd = _descriptors[fd].parent;
  }
  return path;
}

export function _getDescriptorType (fd) {
  return _descriptors[fd].type;
}

export function _setDescriptorType (fd, type) {
  _descriptors[fd].type = type;
}

export function _setSubdescriptorType (fd, path, type) {
  while (_descriptors[fd].parent) {
    path = _descriptors[fd].path + path;
    fd = _descriptors[fd].parent;
  }
  _descriptors[fd].subpathTypes[path] = type;
}

export function _addOpenedDescriptor (fd, path, parentFd) {
  if (fd < preopenCnt || _descriptors[fd])
    throw 'bad-descriptor';
  let type = null;
  for (const [_path, _type] of Object.entries(_descriptors[parentFd].subpathTypes)) {
    if (_path === path)
      type = _type;
  }
  _descriptors[fd] = { path, type, parent: parentFd, subpathTypes: {} };
}

export function _removeOpenedDescriptor (fd) {
  if (fd < preopenCnt)
    throw 'eperm';
  delete _descriptors[fd];
}

export const preopens = {
  getDirectories () {
    return directories;
  }
}

const nsMagnitude = 1_000_000_000_000n;
function nsToDateTime (ns) {
  const seconds = ns / nsMagnitude;
  const nanoseconds = Number(ns % seconds);
  return { seconds, nanoseconds };
}

function _convertFsError (e) {
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

function _lookupType (obj) {
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

export const types = {
  readViaStream(fd, offset) {
    if (Number(offset) !== 0)
      throw new Error('Read streams with non-zero offset not currently supported');
    const stream = _createFsStream(fd, 'file', { offset: 0 });
    return stream;
  },

  writeViaStream(fd, offset) {
    console.log(`[filesystem] WRITE STREAM ${fd} ${offset}`);
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
    let type = _getDescriptorType(fd);
    if (type === null) {
      types.stat(fd);
      type = _getDescriptorType(fd);
    }
    return type;
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
    console.log(`[filesystem] READ`, fd, length, offset);
  },

  write(fd, buffer, offset) {
    console.log(`[filesystem] WRITE`, fd, buffer, offset);
  },

  readDirectory(fd) {
    const fullPath = _getFullPath(fd);
    let dirs;
    try {
      dirs = readdirSync(fullPath, { withFileTypes: true });
    }
    catch (e) {
      _convertFsError(e);
    }
    return _createFsStream(fd, 'dir', { dirs, cursor: 0, fd });
  },

  sync(fd) {
    console.log(`[filesystem] SYNC`, fd);
  },

  createDirectoryAt(fd, path) {
    console.log(`[filesystem] CREATE DIRECTORY`, fd, path);
  },

  stat(fd) {
    let stats;
    try {
      stats = fstatSync(fd, { bigint: true });
    }
    catch (e) {
      _convertFsError(e);
    }
    const type = _lookupType(stats);
    _setDescriptorType(fd, type);
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

  statAt(fd, { symlinkFollow }, path) {
    const fullPath = _descriptors[fd].path + path;
    let stats;
    try {
      stats = (symlinkFollow ? statSync : lstatSync)(fullPath, { bigint: true });
    }
    catch (e) {
      _convertFsError(e);
    }
    const type = _lookupType(stats);
    _setSubdescriptorType(fd, path, type);
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
    // TODO
    // if (pathFlags.symlinkFollow) {
    //   // resolve symlink
    // }
    const fullPath = _descriptors[fd].path + path;
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
    let localFd;
    try {
      localFd = openSync(fullPath, fsOpenFlags, fsMode);
    }
    catch (e) {
      _convertFsError(e);
    }
    _addOpenedDescriptor(localFd, path, fd);
    return localFd;
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
    _removeOpenedDescriptor(fd);
    closeSync(fd);
  },

  readDirectoryEntry(stream) {
    const streamValue = _getFsStreamContext(stream, 'dir');
    if (streamValue.cursor === streamValue.dirs.length)
      return null;
    const dir = streamValue.dirs[streamValue.cursor++];
    const type = _lookupType(dir);
    _setSubdescriptorType(streamValue.fd, '/' + dir.name, type);
    return { inode: null, type, name: dir.name };
  },

  dropDirectoryEntryStream(stream) {
    _dropFsStream(stream);
  },

  metadataHash(fd) {
    let stats;
    try {
      stats = fstatSync(fd, { bigint: true });
    }
    catch (e) {
      _convertFsError(e);
    }
    const type = _lookupType(stats);
    _setDescriptorType(fd, type);
    return { upper: BigInt(stats.size), lower: stats.mtimeNs };
  },

  metadataHashAt(fd, { symlinkFollow }, path) {
    const fullPath = _descriptors[fd].path + path;
    let stats;
    try {
      stats = (symlinkFollow ? statSync : lstatSync)(fullPath, { bigint: true });
    }
    catch (e) {
      _convertFsError(e);
    }
    const type = _lookupType(stats);
    _setSubdescriptorType(fd, path, type);
    return { upper: BigInt(stats.size), lower: stats.mtimeNs };
  }
};
