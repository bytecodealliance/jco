// export interface DescriptorStat {
//   dev: Device,
//   ino: Inode,
//   type: DescriptorType,
//   nlink: Linkcount,
//   size: Filesize,
//   atim: Timestamp,
//   mtim: Timestamp,
//   ctim: Timestamp,
// }

export function readViaStream(fd, offset) {
  console.log(`[filesystem] READ STREAM ${fd} ${offset}`);
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
  console.log(`[filesystem] GET TYPE ${fd}`);
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

export function stat(fd) {
  console.log(`[filesystem] STAT`, fd);
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

export function openAt(fd) {
  console.log(`[filesystem] OPEN AT`, fd);
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
  console.log(`[filesystem] DROP DESCRIPTOR`, fd);
}

export function readDirectoryEntry(stream) {
  console.log(`[filesystem] READ DIRECTRY ENTRY`, stream);
}

export function dropDirectoryEntryStream(stream) {
  console.log(`[filesystem] DROP DIRECTORY ENTRY`, stream);
}
