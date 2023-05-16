import { openSync, constants, statSync, lstatSync, fstatSync, closeSync, readdirSync } from 'node:fs';
import { _descriptors, _addOpenedDescriptor, _removeOpenedDescriptor, _getDescriptorType, _setSubdescriptorType, _setDescriptorType, _getFullPath } from './preopens.js';
import { _createFileStream } from './streams.js';

export function readViaStream(fd, offset) {
  return _createFileStream(fd, offset);
}

export function writeViaStream(fd, offset) {
  console.log(`[filesystem] WRITE STREAM ${fd} ${offset}`);
}

export function appendViaStream(fd) {
  console.log(`[filesystem] APPEND STREAM ${fd}`);
}

export function advise(fd, offset, length, advice) {
  console.log(`[filesystem] ADVISE`, fd, offset, length, advice);
}

export function syncData(fd) {
  console.log(`[filesystem] SYNC DATA ${fd}`);
}

export function getFlags(fd) {
  console.log(`[filesystem] FLAGS FOR ${fd}`);
}

export function getType(fd) {
  let type = _getDescriptorType(fd);
  if (type === null) {
    stat(fd);
    type = _getDescriptorType(fd);
  }
  return type;
}

export function setFlags(fd, flags) {
  console.log(`[filesystem] SET FLAGS ${fd} ${JSON.stringify(flags)}`);
}

export function setSize(fd, size) {
  console.log(`[filesystem] SET SIZE`, fd, size);
}

export function setTimes(fd, dataAccessTimestamp, dataModificationTimestamp) {
  console.log(`[filesystem] SET TIMES`, fd, dataAccessTimestamp, dataModificationTimestamp);
}

export function read(fd, length, offset) {
  console.log(`[filesystem] READ`, fd, length, offset);
}

export function write(fd, buffer, offset) {
  console.log(`[filesystem] WRITE`, fd, buffer, offset);
}

let _dirStreams = [];
export function readDirectory(fd) {
  const fullPath = _getFullPath(fd);
  let dirs;
  try {
    dirs = readdirSync(fullPath, { withFileTypes: true });
  }
  catch (e) {
    _convertFsError(e);
  }
  _dirStreams.push({ fd, dirs, cursor: 0 });
  return _dirStreams.length - 1;
}

export function sync(fd) {
  console.log(`[filesystem] SYNC`, fd);
}

export function createDirectoryAt(fd, path) {
  console.log(`[filesystem] CREATE DIRECTORY`, fd, path);
}

const nsMagnitude = 1_000_000_000_000n;
function nsToDateTime (ns) {
  const seconds = ns / nsMagnitude;
  const nanoseconds = Number(ns % seconds);
  return { seconds, nanoseconds };
}

export function _convertFsError (e) {
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

export function stat(fd) {
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
}

export function statAt(fd, { symlinkFollow }, path) {
  console.log('STAT AT');
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
}

export function setTimesAt(fd) {
  console.log(`[filesystem] SET TIMES AT`, fd);
}

export function linkAt(fd) {
  console.log(`[filesystem] LINK AT`, fd);
}

export function openAt(fd, pathFlags, path, openFlags, descriptorFlags, modes) {
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
}

export function readlinkAt(fd) {
  console.log(`[filesystem] READLINK AT`, fd);
}

export function removeDirectoryAt(fd) {
  console.log(`[filesystem] REMOVE DIR AT`, fd);
}

export function renameAt(fd) {
  console.log(`[filesystem] RENAME AT`, fd);
}

export function symlinkAt(fd) {
  console.log(`[filesystem] SYMLINK AT`, fd);
}

export function unlinkFileAt(fd) {
  console.log(`[filesystem] UNLINK FILE AT`, fd);
}

export function changeFilePermissionsAt(fd) {
  console.log(`[filesystem] CHANGE FILE PERMISSIONS AT`, fd);
}

export function changeDirectoryPermissionsAt(fd) {
  console.log(`[filesystem] CHANGE DIR PERMISSIONS AT`, fd);
}

export function lockShared(fd) {
  console.log(`[filesystem] LOCK SHARED`, fd);
}

export function lockExclusive(fd) {
  console.log(`[filesystem] LOCK EXCLUSIVE`, fd);
}

export function tryLockShared(fd) {
  console.log(`[filesystem] TRY LOCK SHARED`, fd);
}

export function tryLockExclusive(fd) {
  console.log(`[filesystem] TRY LOCK EXCLUSIVE`, fd);
}

export function unlock(fd) {
  console.log(`[filesystem] UNLOCK`, fd);
}

export function dropDescriptor(fd) {
  _removeOpenedDescriptor(fd);
  closeSync(fd);
}

export function readDirectoryEntry(stream) {
  const streamValue = _dirStreams[stream];
  if (streamValue.cursor === streamValue.dirs.length)
    return null;
  const dir = streamValue.dirs[streamValue.cursor++];
  const type = _lookupType(dir);
  _setSubdescriptorType(streamValue.fd, '/' + dir.name, type);
  return { inode: null, type, name: dir.name };
}

export function dropDirectoryEntryStream(stream) {
  _dirStreams.splice(stream, 1);
}
