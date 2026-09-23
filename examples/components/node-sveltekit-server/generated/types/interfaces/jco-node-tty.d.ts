/** @module Interface jco:node/tty@0.1.0 **/
/**
 * Whether `fd` refers to a terminal. The guest range-checks the descriptor first.
 */
export function isTty(fd: number): boolean;
/**
 * Acquire a terminal handle on `fd` for one direction. Fails the way Node's `uv_tty_init`
 * does when `fd` is not a terminal; a handle may be acquired more than once.
 */
export function open(fd: number, direction: Direction): void;
/**
 * Release one acquisition of a handle. Raw mode is restored when the last read handle goes.
 */
export function close(fd: number, direction: Direction): void;
/**
 * The terminal's current size; fails when the terminal does not report one.
 */
export function windowSize(fd: number): TerminalSize;
/**
 * Switch the terminal's input between cooked and raw mode.
 */
export function setRawMode(fd: number, enabled: boolean): void;
/**
 * Block until input is available and return up to `max-bytes` of it; an empty list is the
 * end of input.
 */
export function read(fd: number, maxBytes: number): Uint8Array;
/**
 * Write all of `data` before returning.
 */
export function write(fd: number, data: Uint8Array): void;
/**
 * The environment `getColorDepth()` and `hasColors()` consult when none is passed.
 */
export function environment(): EnvVars;
export type EnvVars = import('./jco-node-types.js').EnvVars;
export type Errno = ErrnoNumber | ErrnoSymbolic;
export interface ErrnoNumber {
  tag: 'number',
  val: bigint,
}
export interface ErrnoSymbolic {
  tag: 'symbolic',
  val: string,
}
/**
 * The libuv failure Node attaches to `ERR_TTY_INIT_FAILED` as `info`.
 */
export interface ErrorInfo {
  errno?: Errno,
  code?: string,
  message?: string,
  syscall?: string,
}
export interface Error {
  name: string,
  message: string,
  code?: string,
  errno?: Errno,
  syscall?: string,
  info?: ErrorInfo,
}
/**
 * Which side of a terminal a stream uses.
 * # Variants
 * 
 * ## `"read"`
 * 
 * ## `"write"`
 */
export type Direction = 'read' | 'write';
export interface TerminalSize {
  columns: number,
  rows: number,
}
