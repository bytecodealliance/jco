import { openSync, constants, fstatSync, closeSync } from 'node:fs';
import { _descriptors, _addOpenedDescriptor, _removeOpenedDescriptor } from './preopens.js';
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
  const type = _descriptors[fd].type;
  if (type === null) {
    console.log('NO TYPE');
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

export function readDirectory(fd) {
  console.log(`[filesystem] READ DIR`, fd);
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
  }
}

export function stat(fd) {
  let stats;
  try {
    stats = fstatSync(fd, { bigint: true });
  }
  catch (e) {
    convertError(e);
  }
  return {
    device: stats.dev,
    inode: stats.ino,
    type: 'regular-file',
    linkCount: stats.nlink,
    size: stats.size,
    dataAccessTimestamp: nsToDateTime(stats.atimeNs),
    dataModificationTimestamp: nsToDateTime(stats.mtimeNs),
    statusChangeTimestamp: nsToDateTime(stats.ctimeNs),
  };
}

export function statAt(fd, pathFlags, path) {
  console.log(`[filesystem] STAT`, fd, pathFlags, path);
}

export function setTimesAt(fd) {
  console.log(`[filesystem] SET TIMES AT`, fd);
}

export function linkAt(fd) {
  console.log(`[filesystem] LINK AT`, fd);
}

export function openAt(fd, pathFlags, path, openFlags, flags, modes) {
  // TODO
  // if (pathFlags.symlinkFollow) {
  //   // resolve symlink
  // }
  const fullPath = _descriptors[fd].path + path;
  let fsOpenFlags = 0x0;
  if (flags.create)
    fsOpenFlags |= constants.O_CREAT;
  if (flags.directory)
    fsOpenFlags |= constants.O_DIRECTORY;
  if (flags.exclusive)
    fsOpenFlags |= constants.O_EXCL;
  if (flags.truncate)
    fsOpenFlags |= constants.O_TRUNC;
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
    convertError(e);
  }
  _addOpenedDescriptor(localFd, 'regular-file', path);
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
  closeSync(fd);
}

export function readDirectoryEntry(stream) {
  console.log(`[filesystem] READ DIRECTRY ENTRY`, stream);
}

export function dropDirectoryEntryStream(stream) {
  console.log(`[filesystem] DROP DIRECTORY ENTRY`, stream);
}
