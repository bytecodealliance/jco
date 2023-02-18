export type Descriptor = number;
export type Filesize = bigint;
export type InputStream = InputStream;
/**
 * # Variants
 * 
 * ## `"access"`
 * 
 * ## `"again"`
 * 
 * ## `"already"`
 * 
 * ## `"badf"`
 * 
 * ## `"busy"`
 * 
 * ## `"deadlk"`
 * 
 * ## `"dquot"`
 * 
 * ## `"exist"`
 * 
 * ## `"fbig"`
 * 
 * ## `"ilseq"`
 * 
 * ## `"inprogress"`
 * 
 * ## `"intr"`
 * 
 * ## `"inval"`
 * 
 * ## `"io"`
 * 
 * ## `"isdir"`
 * 
 * ## `"loop"`
 * 
 * ## `"mlink"`
 * 
 * ## `"msgsize"`
 * 
 * ## `"nametoolong"`
 * 
 * ## `"nodev"`
 * 
 * ## `"noent"`
 * 
 * ## `"nolck"`
 * 
 * ## `"nomem"`
 * 
 * ## `"nospc"`
 * 
 * ## `"nosys"`
 * 
 * ## `"notdir"`
 * 
 * ## `"notempty"`
 * 
 * ## `"notrecoverable"`
 * 
 * ## `"notsup"`
 * 
 * ## `"notty"`
 * 
 * ## `"nxio"`
 * 
 * ## `"overflow"`
 * 
 * ## `"perm"`
 * 
 * ## `"pipe"`
 * 
 * ## `"rofs"`
 * 
 * ## `"spipe"`
 * 
 * ## `"txtbsy"`
 * 
 * ## `"xdev"`
 */
export type Errno = 'access' | 'again' | 'already' | 'badf' | 'busy' | 'deadlk' | 'dquot' | 'exist' | 'fbig' | 'ilseq' | 'inprogress' | 'intr' | 'inval' | 'io' | 'isdir' | 'loop' | 'mlink' | 'msgsize' | 'nametoolong' | 'nodev' | 'noent' | 'nolck' | 'nomem' | 'nospc' | 'nosys' | 'notdir' | 'notempty' | 'notrecoverable' | 'notsup' | 'notty' | 'nxio' | 'overflow' | 'perm' | 'pipe' | 'rofs' | 'spipe' | 'txtbsy' | 'xdev';
export type OutputStream = OutputStream;
export type DirEntryStream = number;
export type Device = bigint;
export type Inode = bigint;
/**
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * ## `"block-device"`
 * 
 * ## `"character-device"`
 * 
 * ## `"directory"`
 * 
 * ## `"fifo"`
 * 
 * ## `"symbolic-link"`
 * 
 * ## `"regular-file"`
 * 
 * ## `"socket"`
 */
export type DescriptorType = 'unknown' | 'block-device' | 'character-device' | 'directory' | 'fifo' | 'symbolic-link' | 'regular-file' | 'socket';
export type Linkcount = bigint;
export type Datetime = Datetime;
export interface DescriptorStat {
  dev: Device,
  ino: Inode,
  type: DescriptorType,
  nlink: Linkcount,
  size: Filesize,
  atim: Datetime,
  mtim: Datetime,
  ctim: Datetime,
}
export interface AtFlags {
  symlinkFollow?: boolean,
}
export interface OFlags {
  create?: boolean,
  directory?: boolean,
  excl?: boolean,
  trunc?: boolean,
}
export interface DescriptorFlags {
  read?: boolean,
  write?: boolean,
  dsync?: boolean,
  nonblock?: boolean,
  rsync?: boolean,
  sync?: boolean,
}
export interface Mode {
  readable?: boolean,
  writeable?: boolean,
  executable?: boolean,
}
export namespace WasiFilesystem {
  export function readViaStream(fd: Descriptor, offset: Filesize): InputStream;
  export function writeViaStream(fd: Descriptor, offset: Filesize): OutputStream;
  export function appendViaStream(fd: Descriptor): OutputStream;
  export function closeDirEntryStream(s: DirEntryStream): void;
  export function stat(fd: Descriptor): DescriptorStat;
  export function openAt(fd: Descriptor, atFlags: AtFlags, path: string, oFlags: OFlags, flags: DescriptorFlags, mode: Mode): Descriptor;
  export function close(fd: Descriptor): void;
}
