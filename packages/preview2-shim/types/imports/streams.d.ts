export namespace Streams {
  export function read(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, boolean];
  export function blockingRead(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, boolean];
  export function skip(this: InputStream, len: bigint): [bigint, boolean];
  export function blockingSkip(this: InputStream, len: bigint): [bigint, boolean];
  export function subscribeToInputStream(this: InputStream): Pollable;
  export function dropInputStream(this: InputStream): void;
  export function write(this: OutputStream, buf: Uint8Array): bigint;
  export function blockingWrite(this: OutputStream, buf: Uint8Array): bigint;
  export function writeZeroes(this: OutputStream, len: bigint): bigint;
  export function blockingWriteZeroes(this: OutputStream, len: bigint): bigint;
  export function splice(this: OutputStream, src: InputStream, len: bigint): [bigint, boolean];
  export function blockingSplice(this: OutputStream, src: InputStream, len: bigint): [bigint, boolean];
  export function forward(this: OutputStream, src: InputStream): bigint;
  export function subscribeToOutputStream(this: OutputStream): Pollable;
  export function dropOutputStream(this: OutputStream): void;
}
export type InputStream = number;
export interface StreamError {
}
import type { Pollable } from '../imports/poll';
export { Pollable };
export type OutputStream = number;
