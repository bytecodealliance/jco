export type InputStream = number;
export interface StreamError {
}
export type OutputStream = number;
export namespace WasiIo {
  export function read(src: InputStream, len: bigint): [Uint8Array | ArrayBuffer, boolean];
  export function write(dst: OutputStream, buf: Uint8Array): bigint;
  export function dropInputStream(f: InputStream): void;
  export function dropOutputStream(f: OutputStream): void;
}
