export const preopens = {
  getDirectories () {
    return [];
  }
}

export const types = {
  readViaStream(fd, offset) {
    console.log(`[filesystem] READ STREAM ${fd} ${offset}`);
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
    console.log(`[filesystem] GET TYPE ${fd}`);
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
    console.log(`[filesystem] READ DIR`, fd);
  },

  sync(fd) {
    console.log(`[filesystem] SYNC`, fd);
  },

  createDirectoryAt(fd, path) {
    console.log(`[filesystem] CREATE DIRECTORY`, fd, path);
  },

  stat(fd) {
    console.log(`[filesystem] STAT`, fd);
  },
  
  statAt(fd, pathFlags, path) {
    console.log(`[filesystem] STAT`, fd, pathFlags, path);
  },

  setTimesAt(fd) {
    console.log(`[filesystem] SET TIMES AT`, fd);
  },

  linkAt(fd) {
    console.log(`[filesystem] LINK AT`, fd);
  },

  openAt(fd) {
    console.log(`[filesystem] OPEN AT ${fd}`);
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
    console.log(`[filesystem] DROP DESCRIPTOR`, fd);
  },

  readDirectoryEntry(stream) {
    console.log(`[filesystem] READ DIRECTRY ENTRY`, stream);
  },

  dropDirectoryEntryStream(stream) {
    console.log(`[filesystem] DROP DIRECTORY ENTRY`, stream);
  },

  metadataHash(fd) {
    console.log(`[filesystem] METADATA HASH`, fd);
  },

  metadataHashAt(fd, pathFlags, path) {
    console.log(`[filesystem] METADATA HASH AT `, fd, pathFlags, path);
  }
};

export { types as filesystemTypes }
