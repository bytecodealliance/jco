export namespace IoStreams {
  /**
   * Read bytes from a stream.
   * 
   * This function returns a list of bytes containing the data that was
   * read, along with a bool which, when true, indicates that the end of the
   * stream was reached. The returned list will contain up to `len` bytes; it
   * may return fewer than requested, but not more.
   * 
   * Once a stream has reached the end, subsequent calls to read or
   * `skip` will always report end-of-stream rather than producing more
   * data.
   * 
   * If `len` is 0, it represents a request to read 0 bytes, which should
   * always succeed, assuming the stream hasn't reached its end yet, and
   * return an empty list.
   * 
   * The len here is a `u64`, but some callees may not be able to allocate
   * a buffer as large as that would imply.
   * FIXME: describe what happens if allocation fails.
   */
  export function read(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, boolean];
  /**
   * Read bytes from a stream, with blocking.
   * 
   * This is similar to `read`, except that it blocks until at least one
   * byte can be read.
   */
  export function blockingRead(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, boolean];
  /**
   * Skip bytes from a stream.
   * 
   * This is similar to the `read` function, but avoids copying the
   * bytes into the instance.
   * 
   * Once a stream has reached the end, subsequent calls to read or
   * `skip` will always report end-of-stream rather than producing more
   * data.
   * 
   * This function returns the number of bytes skipped, along with a bool
   * indicating whether the end of the stream was reached. The returned
   * value will be at most `len`; it may be less.
   */
  export function skip(this: InputStream, len: bigint): [bigint, boolean];
  /**
   * Skip bytes from a stream, with blocking.
   * 
   * This is similar to `skip`, except that it blocks until at least one
   * byte can be consumed.
   */
  export function blockingSkip(this: InputStream, len: bigint): [bigint, boolean];
  /**
   * Create a `pollable` which will resolve once either the specified stream
   * has bytes available to read or the other end of the stream has been
   * closed.
   */
  export function subscribeToInputStream(this: InputStream): Pollable;
  /**
   * Dispose of the specified `input-stream`, after which it may no longer
   * be used.
   */
  export function dropInputStream(this: InputStream): void;
  /**
   * Write bytes to a stream.
   * 
   * This function returns a `u64` indicating the number of bytes from
   * `buf` that were written; it may be less than the full list.
   */
  export function write(this: OutputStream, buf: Uint8Array): bigint;
  /**
   * Write bytes to a stream, with blocking.
   * 
   * This is similar to `write`, except that it blocks until at least one
   * byte can be written.
   */
  export function blockingWrite(this: OutputStream, buf: Uint8Array): bigint;
  /**
   * Write multiple zero bytes to a stream.
   * 
   * This function returns a `u64` indicating the number of zero bytes
   * that were written; it may be less than `len`.
   */
  export function writeZeroes(this: OutputStream, len: bigint): bigint;
  /**
   * Write multiple zero bytes to a stream, with blocking.
   * 
   * This is similar to `write-zeroes`, except that it blocks until at least
   * one byte can be written.
   */
  export function blockingWriteZeroes(this: OutputStream, len: bigint): bigint;
  /**
   * Read from one stream and write to another.
   * 
   * This function returns the number of bytes transferred; it may be less
   * than `len`.
   * 
   * Unlike other I/O functions, this function blocks until all the data
   * read from the input stream has been written to the output stream.
   */
  export function splice(this: OutputStream, src: InputStream, len: bigint): [bigint, boolean];
  /**
   * Read from one stream and write to another, with blocking.
   * 
   * This is similar to `splice`, except that it blocks until at least
   * one byte can be read.
   */
  export function blockingSplice(this: OutputStream, src: InputStream, len: bigint): [bigint, boolean];
  /**
   * Forward the entire contents of an input stream to an output stream.
   * 
   * This function repeatedly reads from the input stream and writes
   * the data to the output stream, until the end of the input stream
   * is reached, or an error is encountered.
   * 
   * Unlike other I/O functions, this function blocks until the end
   * of the input stream is seen and all the data has been written to
   * the output stream.
   * 
   * This function returns the number of bytes transferred.
   */
  export function forward(this: OutputStream, src: InputStream): bigint;
  /**
   * Create a `pollable` which will resolve once either the specified stream
   * is ready to accept bytes or the other end of the stream has been closed.
   */
  export function subscribeToOutputStream(this: OutputStream): Pollable;
  /**
   * Dispose of the specified `output-stream`, after which it may no longer
   * be used.
   */
  export function dropOutputStream(this: OutputStream): void;
}
import type { Pollable } from '../imports/poll';
export { Pollable };
/**
 * An error type returned from a stream operation. Currently this
 * doesn't provide any additional information.
 */
export interface StreamError {
}
/**
 * An output bytestream. In the future, this will be replaced by handle
 * types.
 * 
 * This conceptually represents a `stream<u8, _>`. It's temporary
 * scaffolding until component-model's async features are ready.
 * 
 * `output-stream`s are *non-blocking* to the extent practical on
 * underlying platforms. Except where specified otherwise, I/O operations also
 * always return promptly, after the number of bytes that can be written
 * promptly, which could even be zero. To wait for the stream to be ready to
 * accept data, the `subscribe-to-output-stream` function to obtain a
 * `pollable` which can be polled for using `wasi_poll`.
 * 
 * And at present, it is a `u32` instead of being an actual handle, until
 * the wit-bindgen implementation of handles and resources is ready.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type OutputStream = number;
/**
 * An input bytestream. In the future, this will be replaced by handle
 * types.
 * 
 * This conceptually represents a `stream<u8, _>`. It's temporary
 * scaffolding until component-model's async features are ready.
 * 
 * `input-stream`s are *non-blocking* to the extent practical on underlying
 * platforms. I/O operations always return promptly; if fewer bytes are
 * promptly available than requested, they return the number of bytes promptly
 * available, which could even be zero. To wait for data to be available,
 * use the `subscribe-to-input-stream` function to obtain a `pollable` which
 * can be polled for using `wasi_poll`.
 * 
 * And at present, it is a `u32` instead of being an actual handle, until
 * the wit-bindgen implementation of handles and resources is ready.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type InputStream = number;
