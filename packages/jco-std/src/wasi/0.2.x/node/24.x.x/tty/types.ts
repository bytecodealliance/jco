/**
 * Public value shapes follow @types/node 24 tty.d.ts (MIT). The WIT provider types are Jco-owned
 * and carry no dependency on Node declarations; they must stay identical to the records
 * `jco:node/tty@0.1.0` declares, since transpiled bindings produce exactly these object shapes.
 */
import type { HostErrno, HostErrorBase, HostImports, HostResult } from "../internal/wit-types.js";
import type { Callback, Duplex, DuplexOptions } from "../stream/types.js";

/** The libuv failure Node attaches to `ERR_TTY_INIT_FAILED` as `info`. */
export interface TtyErrorInfo {
  errno?: HostErrno;
  code?: string;
  message?: string;
  syscall?: string;
}

export interface TtyError extends HostErrorBase {
  info?: TtyErrorInfo;
}

export type TtyResult<T> = HostResult<T, TtyError>;

export type TtyDirection = "read" | "write";

export interface TtyWindowSize {
  columns: number;
  rows: number;
}

/** Environment name/value pairs, as the shared `jco:node/types` `env-vars` type lowers. */
export type TtyEnvironment = [string, string][];

/** The `jco:node/tty@0.1.0` contract, in the tagged-result form the WIT declares. */
export interface TtyHost {
  isTty(fd: number): TtyResult<boolean>;
  open(fd: number, direction: TtyDirection): TtyResult<void>;
  close(fd: number, direction: TtyDirection): TtyResult<void>;
  windowSize(fd: number): TtyResult<TtyWindowSize>;
  setRawMode(fd: number, enabled: boolean): TtyResult<void>;
  read(fd: number, maxBytes: number): TtyResult<Uint8Array>;
  write(fd: number, data: Uint8Array): TtyResult<void>;
  environment(): TtyResult<TtyEnvironment>;
}

/** A provider may return bare values and throw error records, as jco's bindings do. */
export type TtyProvider = HostImports<TtyHost>;

/** An environment object as `getColorDepth()` and `hasColors()` read it. */
export type ColorEnvironment = Readonly<Record<string, string | undefined>>;

/** Options accepted by `new tty.ReadStream(fd, options)`; the stream's sides are fixed. */
export type ReadStreamOptions = Omit<DuplexOptions, "readable" | "writable">;

export interface ReadStream extends Duplex {
  isRaw: boolean;
  isTTY: boolean;
  setRawMode(mode: boolean): this;
}

export interface WriteStream extends Duplex {
  isTTY: boolean;
  /** Present only when the terminal reported a size, as in Node. */
  columns: number | undefined;
  rows: number | undefined;
  getColorDepth(env?: ColorEnvironment): number;
  hasColors(count?: number, env?: ColorEnvironment): boolean;
  hasColors(env?: ColorEnvironment): boolean;
  _refreshSize(): void;
  cursorTo(x: number, y?: number, callback?: Callback): boolean;
  cursorTo(x: number, callback: Callback): boolean;
  moveCursor(dx: number, dy: number, callback?: Callback): boolean;
  clearLine(dir: -1 | 0 | 1, callback?: Callback): boolean;
  clearScreenDown(callback?: Callback): boolean;
  getWindowSize(): [number | undefined, number | undefined];
}

export interface ReadStreamConstructor {
  new (fd: number, options?: ReadStreamOptions): ReadStream;
  (fd: number, options?: ReadStreamOptions): ReadStream;
  prototype: ReadStream;
}

export interface WriteStreamConstructor {
  new (fd: number): WriteStream;
  (fd: number): WriteStream;
  prototype: WriteStream;
}

export interface TtyModule {
  isatty(fd: number): boolean;
  ReadStream: ReadStreamConstructor;
  WriteStream: WriteStreamConstructor;
}
