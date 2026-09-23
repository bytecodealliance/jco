/** @module Interface jco:node/fs@0.1.0 **/
export function access(path: Path, mode: number): void;
export function appendFile(file: PathOrDescriptor, data: Uint8Array, options: WriteFileOptions): void;
export function chmod(path: Path, mode: Mode): void;
export function chown(path: Path, uid: number, gid: number): void;
export function close(descriptor: number): void;
export function copyFile(source: Path, destination: Path, mode: number): void;
export function cp(source: Path, destination: Path, options: CopyOptions): void;
export function exists(path: Path): boolean;
export function fchmod(descriptor: number, mode: Mode): void;
export function fchown(descriptor: number, uid: number, gid: number): void;
export function fdatasync(descriptor: number): void;
export function fstat(descriptor: number, options: StatOptions): Stats;
export function fsync(descriptor: number): void;
export function ftruncate(descriptor: number, length: number): void;
export function futimes(descriptor: number, atime: number, mtime: number): void;
export function glob(patterns: Array<string>, options: GlobOptions): Array<GlobEntry>;
export function lchown(path: Path, uid: number, gid: number): void;
export function link(existingPath: Path, newPath: Path): void;
export function lstat(path: Path, options: StatOptions): Stats | undefined;
export function lutimes(path: Path, atime: number, mtime: number): void;
export function mkdir(path: Path, options: MkdirOptions): string | undefined;
export function mkdtemp(prefix: string): string;
export function open(path: Path, flags: OpenMode, mode: Mode): number;
export function readFile(file: PathOrDescriptor, options: ReadFileOptions): Uint8Array;
export function readdir(path: Path, options: ReaddirOptions): Array<DirectoryEntry>;
export function readlink(path: Path): string;
export function realpath(path: Path): string;
export function rename(oldPath: Path, newPath: Path): void;
export function rm(path: Path, options: RemoveOptions): void;
export function rmdir(path: Path, options: RemoveOptions): void;
export function stat(path: Path, options: StatOptions): Stats | undefined;
export function statfs(path: Path, bigint: boolean): StatfsResult;
export function symlink(target: Path, path: Path, type: string | undefined): void;
export function truncate(path: Path, length: number): void;
export function unlink(path: Path): void;
export function utimes(path: Path, atime: number, mtime: number): void;
export function writeFile(file: PathOrDescriptor, data: Uint8Array, options: WriteFileOptions): void;
export function read(descriptor: number, length: number, position: bigint | undefined): ReadResult;
export function write(descriptor: number, data: Uint8Array, position: bigint | undefined): number;
export function readv(descriptor: number, lengths: Uint32Array, position: bigint | undefined): ReadvResult;
export function writev(descriptor: number, buffers: Array<Uint8Array>, position: bigint | undefined): number;
export type Path = PathText | PathBytes | PathFileUrl;
export interface PathText {
  tag: 'text',
  val: string,
}
export interface PathBytes {
  tag: 'bytes',
  val: Uint8Array,
}
export interface PathFileUrl {
  tag: 'file-url',
  val: string,
}
export type PathOrDescriptor = PathOrDescriptorPath | PathOrDescriptorDescriptor;
export interface PathOrDescriptorPath {
  tag: 'path',
  val: Path,
}
export interface PathOrDescriptorDescriptor {
  tag: 'descriptor',
  val: number,
}
export type Mode = ModeNumber | ModeSymbolic;
export interface ModeNumber {
  tag: 'number',
  val: number,
}
export interface ModeSymbolic {
  tag: 'symbolic',
  val: string,
}
export type OpenMode = OpenModeNumber | OpenModeSymbolic;
export interface OpenModeNumber {
  tag: 'number',
  val: number,
}
export interface OpenModeSymbolic {
  tag: 'symbolic',
  val: string,
}
export type Errno = ErrnoNumber | ErrnoSymbolic;
export interface ErrnoNumber {
  tag: 'number',
  val: bigint,
}
export interface ErrnoSymbolic {
  tag: 'symbolic',
  val: string,
}
export interface Error {
  name: string,
  message: string,
  code?: string,
  errno?: Errno,
  syscall?: string,
  path?: string,
  dest?: string,
}
/**
 * # Variants
 * 
 * ## `"block"`
 * 
 * ## `"character"`
 * 
 * ## `"directory"`
 * 
 * ## `"fifo"`
 * 
 * ## `"file"`
 * 
 * ## `"socket"`
 * 
 * ## `"symlink"`
 * 
 * ## `"unknown"`
 */
export type FileType = 'block' | 'character' | 'directory' | 'fifo' | 'file' | 'socket' | 'symlink' | 'unknown';
export type Numeric = NumericNumber | NumericBigint;
export interface NumericNumber {
  tag: 'number',
  val: number,
}
export interface NumericBigint {
  tag: 'bigint',
  val: bigint,
}
export interface Stats {
  dev: Numeric,
  ino: Numeric,
  mode: Numeric,
  nlink: Numeric,
  uid: Numeric,
  gid: Numeric,
  rdev: Numeric,
  size: Numeric,
  blksize: Numeric,
  blocks: Numeric,
  atimeMs: Numeric,
  mtimeMs: Numeric,
  ctimeMs: Numeric,
  birthtimeMs: Numeric,
  atimeNs?: bigint,
  mtimeNs?: bigint,
  ctimeNs?: bigint,
  birthtimeNs?: bigint,
  fileType: FileType,
}
export interface StatfsResult {
  type: Numeric,
  bsize: Numeric,
  blocks: Numeric,
  bfree: Numeric,
  bavail: Numeric,
  files: Numeric,
  ffree: Numeric,
}
export interface Dirent {
  name: string,
  parentPath: string,
  fileType: FileType,
}
export type DirectoryEntry = DirectoryEntryName | DirectoryEntryDirent;
export interface DirectoryEntryName {
  tag: 'name',
  val: string,
}
export interface DirectoryEntryDirent {
  tag: 'dirent',
  val: Dirent,
}
export type GlobEntry = GlobEntryPath | GlobEntryDirent;
export interface GlobEntryPath {
  tag: 'path',
  val: string,
}
export interface GlobEntryDirent {
  tag: 'dirent',
  val: Dirent,
}
export type GlobExclude = GlobExcludePattern | GlobExcludePatterns;
export interface GlobExcludePattern {
  tag: 'pattern',
  val: string,
}
export interface GlobExcludePatterns {
  tag: 'patterns',
  val: Array<string>,
}
export interface CopyOptions {
  dereference: boolean,
  errorOnExist: boolean,
  force: boolean,
  preserveTimestamps: boolean,
  recursive: boolean,
  verbatimSymlinks: boolean,
}
export interface GlobOptions {
  cwd?: Path,
  exclude?: GlobExclude,
  withFileTypes: boolean,
}
export interface MkdirOptions {
  recursive: boolean,
  mode?: Mode,
}
export interface ReaddirOptions {
  recursive: boolean,
  withFileTypes: boolean,
}
export interface RemoveOptions {
  force: boolean,
  maxRetries: number,
  recursive: boolean,
  retryDelay: number,
}
export interface StatOptions {
  bigint: boolean,
  throwIfNoEntry: boolean,
}
export interface ReadFileOptions {
  flag?: string,
}
export interface WriteFileOptions {
  flag?: string,
  mode?: Mode,
  flush: boolean,
}
export interface ReadResult {
  bytesRead: number,
  data: Uint8Array,
}
export interface ReadvResult {
  bytesRead: number,
  buffers: Array<Uint8Array>,
}
